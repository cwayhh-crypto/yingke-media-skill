"""Extend the bundled upstream XiaoHongShu extractor to RedNote's host.

Reuses yt-dlp's page parser and the original URL (including xsec_token).
No authentication, verification or private-content restrictions are bypassed.
Reference: https://github.com/yt-dlp/yt-dlp/issues/16519
"""
from yt_dlp.extractor.xiaohongshu import XiaoHongShuIE as _BaseXiaoHongShuIE


class YingkeRedNoteIE(_BaseXiaoHongShuIE):
    _VALID_URL = r'https?://(?:www\.)?(?:xiaohongshu|rednote)\.com/(?:explore|discovery/item)/(?P<id>[\da-f]+)'
