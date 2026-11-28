"""requirements 文件由 pip 解析，而 pip 只认 `#` 注释。

CI 首跑就是因为这里用 Python 文档串当说明块，本地环境是手工建的所以从没暴露。
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FILES = ["requirements-asset.txt", "requirements-dev.txt"]
OPERATOR = r"(===|==|>=|<=|~=|!=|>|<)"
LINE = re.compile(rf"^[A-Za-z0-9][A-Za-z0-9._-]*\s*{OPERATOR}\s*[^\s;]+$")


def _lines(name: str) -> list[str]:
    text = (ROOT / name).read_text(encoding="utf-8")
    assert text.endswith("\n"), f"{name} 缺少结尾换行，最后一行会被某些工具漏读"
    return [line.strip() for line in text.splitlines() if line.strip()]


def test_every_line_is_a_comment_or_a_pinned_requirement():
    for name in FILES:
        for line in _lines(name):
            assert line.startswith("#") or LINE.match(line), f"{name}: pip 无法解析 {line!r}"


def test_dependencies_are_pinned_and_not_self_referential():
    for name in FILES:
        specs = [line for line in _lines(name) if not line.startswith("#")]
        assert specs, f"{name} 没有任何依赖，多半是被误清空了"
        for line in specs:
            assert "==" in line, f"{name}: {line!r} 未锁版本，CI 与本地会漂"
        assert "-r " not in " ".join(specs), f"{name}: 不要用 -r 互相引用，CI 装一次就够"
