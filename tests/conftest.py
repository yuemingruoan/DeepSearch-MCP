"""测试配置：确保项目根目录在 Python 搜索路径中。"""

from __future__ import annotations

import pathlib
import sys

ROOT_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
