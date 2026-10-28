"""Experimental Douyin compatibility adapter.
Adapted from yt-dlp PR #17826, head d5e0f9b (2026-10-21), Unlicense.
Source: https://github.com/yt-dlp/yt-dlp/pull/17826/files
Uses anonymous site cookies; never reads browser profiles or account stores.
"""
import hashlib
import json
import time
import urllib.parse
import uuid
from yt_dlp.extractor.tiktok import DouyinIE as _BaseDouyinIE
from yt_dlp.utils import ExtractorError


class _YingkeDouyinIE(_BaseDouyinIE, plugin_name='yingke_douyin_17826'):
    _AID = 6383
    _SEC_SALT = 'A96D855A08C0A9707F8BEF0D9A527E4E'

    def _prepare_anonymous_session(self):
        cookies = self._get_cookies(self._WEBPAGE_HOST)
        if not cookies.get('passport_csrf_token'):
            self._set_cookie('.douyin.com', 'passport_csrf_token', uuid.uuid4().hex)
        if not cookies.get('ttwid'):
            self._request_webpage(
                f'{self._WEBPAGE_HOST}ttwid/register', None,
                data=json.dumps({'aid': self._AID, 'service': 'www.douyin.com'}).encode(),
                headers={'content-type': 'application/json'})
            if not self._get_cookies(self._WEBPAGE_HOST).get('ttwid'):
                raise ExtractorError('Douyin anonymous session initialization failed', expected=True)

    def _session_identifier(self):
        cookies = self._get_cookies(self._WEBPAGE_HOST)
        for name in ('uifid', 'uifid_temp', 'uifidtemp', 'UIFID', 'UIFID_TEMP', 'UIFIDTEMP'):
            cookie = cookies.get(name)
            if cookie and cookie.value:
                return cookie.value
        response = self._request_webpage(self._WEBPAGE_HOST, None)
        value = response.headers.get('x-tt-trace-host')
        if not value:
            raise ExtractorError('Douyin did not provide an anonymous session identifier', expected=True)
        return value

    def _signed_query(self, video_id):
        identifier = self._session_identifier()
        timestamp = str(int(time.time()))
        query = {'aweme_id': video_id, 'aid': self._AID, 'uifid': identifier, 'timestamp': timestamp}
        encoded = urllib.parse.urlencode(query)
        signature = hashlib.md5(f'{identifier}_{timestamp}_{self._SEC_SALT}_{encoded}'.encode()).hexdigest()
        return {**query, 'x-secsdk-web-signature': signature}

    def _real_extract(self, url):
        video_id = self._match_id(url)
        self.to_screen('Using experimental Douyin compatibility adapter (PR #17826)')
        self._prepare_anonymous_session()
        payload = self._download_json(
            'https://www.douyin.com/aweme/v1/web/aweme/detail/', video_id,
            note='Downloading video details', query=self._signed_query(video_id))
        detail = payload.get('aweme_detail') if isinstance(payload, dict) else None
        if not isinstance(detail, dict):
            raise ExtractorError('Douyin returned no video details; access or site compatibility remains unresolved', expected=True)
        return {**self._parse_aweme_video_app(detail), 'http_headers': {'Referer': self._WEBPAGE_HOST}}
