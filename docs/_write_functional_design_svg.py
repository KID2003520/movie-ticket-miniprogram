# -*- coding: utf-8 -*-
"""系统功能整体设计图（UTF-8 SVG），输出到桌面论文目录与 docs。"""
import os

_desktop = os.path.join(
    os.path.expanduser("~"),
    "Desktop",
    "毕业论文",
    "er图",
    "电影票系统-功能整体设计图.svg",
)
_repo = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "电影票系统-功能整体设计图.svg",
)

# 中文统一用 \\u 转义，保证脚本源文件为 ASCII、输出为正确 UTF-8
U = {
    "title": "\u7535\u5f71\u7968\u9884\u8ba2\u7cfb\u7edf - \u529f\u80fd\u6574\u4f53\u8bbe\u8ba1",
    "sub": "\u5c0f\u7a0b\u5e8f\u4e1a\u52a1\u6a21\u5757\u5212\u5206\uff08\u5bf9\u5e94 TabBar \u4e0e\u9875\u9762\u8def\u7531\uff09",
    "m1": "\u95e8\u6237\u4e0e\u5185\u5bb9",
    "m1a": "\u9996\u9875\u63a8\u8350\u3001\u8f6e\u64ad",
    "m1b": "\u7535\u5f71\u5217\u8868\uff08\u70ed\u6620/\u5373\u5c06\uff09",
    "m1c": "\u7535\u5f71\u8be6\u60c5\u3001\u8bc4\u5206\u4e0e\u5267\u60c5",
    "m1d": "\u5173\u952e\u8bcd\u641c\u7d22",
    "m2": "\u5f71\u9662\u4e0e\u8d2d\u7968",
    "m2a": "\u5f71\u9662\u5217\u8868\u3001\u8ddd\u79bb/\u57ce\u5e02",
    "m2b": "\u5f71\u9662\u8be6\u60c5\u3001\u573a\u6b21\u6392\u671f",
    "m2c": "\u53ef\u89c6\u5316\u9009\u5ea7\u3001\u5ea7\u4f4d\u9501\u5b9a",
    "m2d": "\u573a\u6b21\u8be6\u60c5\u67e5\u8be2",
    "m3": "\u8ba2\u5355\u4e0e\u652f\u4ed8",
    "m3a": "\u521b\u5efa\u8ba2\u5355\u3001\u5f85\u652f\u4ed8\u5012\u8ba1\u65f6",
    "m3b": "\u8ba2\u5355\u5217\u8868\u3001\u8ba2\u5355\u8be6\u60c5",
    "m3c": "\u652f\u4ed8\u5b9d\u652f\u4ed8 / \u6a21\u62df\u652f\u4ed8",
    "m3d": "\u9000\u6b3e\u3001\u53d6\u6d88\u3001\u5220\u9664\u8ba2\u5355",
    "m4": "\u7528\u6237\u4e0e\u6743\u76ca",
    "m4a": "\u624b\u673a\u53f7\u6ce8\u518c\u3001\u767b\u5f55",
    "m4b": "\u4e2a\u4eba\u4e2d\u5fc3\u3001\u8d26\u53f7\u4fe1\u606f",
    "m4c": "\u6211\u7684\u6536\u85cf",
    "m4d": "\u4f18\u60e0\u5238\u5546\u57ce\u4e0e\u6211\u7684\u5361\u5238",
    "m4e": "\u5728\u7ebf\u5ba2\u670d\u3001\u8bbe\u7f6e",
    "adm": "\u8fd0\u8425\u7ba1\u7406\uff08\u7ba1\u7406\u5458\uff09",
    "adma": "\u6570\u636e\u62a5\u8868\u4e0e\u7edf\u8ba1",
    "admb": "\u5f71\u7247\u7ef4\u62a4\u3001TMDB \u5bfc\u5165",
    "admc": "\u5f71\u9662/\u5f71\u5385\u7ba1\u7406",
    "admd": "\u7528\u6237\u7ba1\u7406",
    "adme": "\u6d4f\u89c8\u5668\u7ba1\u7406\u540e\u53f0 admin-web",
    "sup": "\u6280\u672f\u4e0e\u5916\u90e8\u534f\u540c",
    "supa": "Express REST API\uff08\u4e0e\u5c0f\u7a0b\u5e8f\u5bf9\u63a5\uff09",
    "supb": "MySQL \u6570\u636e\u6301\u4e45\u5316",
    "supc": "TMDB \u5143\u6570\u636e\u540c\u6b65\u3001\u6d77\u62a5\u4ee3\u7406",
    "supd": "\u652f\u4ed8\u5b9d SDK\u3001\u652f\u4ed8\u56de\u8c03",
}

def box(x, y, w, h, fill, stroke, title, lines, title_size=12, line_size=9.5):
    """Single module card as SVG fragment."""
    parts = [
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{fill}" stroke="{stroke}" stroke-width="1.4"/>',
    ]
    if title:
        parts.append(
            f'<text x="{x + 12}" y="{y + 22}" font-family="Microsoft YaHei UI, PingFang SC, sans-serif" '
            f'font-size="{title_size}" font-weight="600" fill="#0f172a">{title}</text>'
        )
    ly = y + (38 if title else 18)
    for line in lines:
        parts.append(
            f'<text x="{x + 12}" y="{ly}" font-family="Microsoft YaHei UI, PingFang SC, sans-serif" '
            f'font-size="{line_size}" fill="#334155">{line}</text>'
        )
        ly += 14
    return "\n  ".join(parts)


def main():
    W, H = 960, 720
    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
  <defs>
    <linearGradient id="bgf" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#f8fafc"/>
      <stop offset="100%" style="stop-color:#e8eef5"/>
    </linearGradient>
    <filter id="sh" x="-2%" y="-2%" width="104%" height="104%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="2.5" flood-opacity="0.1"/>
    </filter>
    <marker id="arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <polygon points="0 0, 7 3.5, 0 7" fill="#94a3b8"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="url(#bgf)"/>

  <text x="{W//2}" y="44" text-anchor="middle" font-family="Microsoft YaHei UI, PingFang SC, sans-serif"
        font-size="22" font-weight="700" fill="#0f172a">{U["title"]}</text>
  <text x="{W//2}" y="68" text-anchor="middle" font-family="Microsoft YaHei UI, PingFang SC, sans-serif"
        font-size="12" fill="#64748b">{U["sub"]}</text>

  <rect x="24" y="84" width="{W-48}" height="540" rx="12" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.2" filter="url(#sh)"/>

  <!-- row: four pillars -->
  {box(40, 100, 210, 168, "#eff6ff", "#3b82f6", U["m1"], [U["m1a"], U["m1b"], U["m1c"], U["m1d"]])}
  {box(265, 100, 210, 168, "#ecfdf5", "#10b981", U["m2"], [U["m2a"], U["m2b"], U["m2c"], U["m2d"]])}
  {box(490, 100, 210, 168, "#fff7ed", "#f97316", U["m3"], [U["m3a"], U["m3b"], U["m3c"], U["m3d"]])}
  {box(715, 100, 210, 168, "#fce7f3", "#db2777", U["m4"], [U["m4a"], U["m4b"], U["m4c"], U["m4d"], U["m4e"]])}

  <!-- arrows: browsing flow -->
  <path d="M 250 166 L 265 166" stroke="#94a3b8" stroke-width="1.5" fill="none" marker-end="url(#arr)"/>
  <path d="M 475 166 L 490 166" stroke="#94a3b8" stroke-width="1.5" fill="none" marker-end="url(#arr)"/>
  <path d="M 700 166 L 715 166" stroke="#94a3b8" stroke-width="1.5" fill="none" marker-end="url(#arr)"/>
  <text x="252" y="158" font-size="9" fill="#64748b">\u6d4f\u89c8</text>
  <text x="478" y="158" font-size="9" fill="#64748b">\u4e0b\u5355</text>
  <text x="702" y="158" font-size="9" fill="#64748b">\u8d26\u6237</text>

  <!-- admin strip -->
  <text x="48" y="300" font-family="Microsoft YaHei UI, PingFang SC, sans-serif" font-size="13" font-weight="600" fill="#334155">{U["adm"]}</text>
  {box(40, 312, 885, 92, "#f5f3ff", "#7c3aed", "", [])}
  <text x="56" y="338" font-family="Microsoft YaHei UI, PingFang SC, sans-serif" font-size="10.5" fill="#334155">\u2022 {U["adma"]}</text>
  <text x="56" y="356" font-family="Microsoft YaHei UI, PingFang SC, sans-serif" font-size="10.5" fill="#334155">\u2022 {U["admb"]}</text>
  <text x="56" y="374" font-family="Microsoft YaHei UI, PingFang SC, sans-serif" font-size="10.5" fill="#334155">\u2022 {U["admc"]}</text>
  <text x="320" y="338" font-family="Microsoft YaHei UI, PingFang SC, sans-serif" font-size="10.5" fill="#334155">\u2022 {U["admd"]}</text>
  <text x="320" y="356" font-family="Microsoft YaHei UI, PingFang SC, sans-serif" font-size="10.5" fill="#334155">\u2022 {U["adme"]}</text>
  <text x="320" y="374" font-family="Microsoft YaHei UI, PingFang SC, sans-serif" font-size="10.5" fill="#334155">\u2022 \u5c0f\u7a0b\u5e8f\u5185 admin-* \u9875\u9762\u4e0e\u8fd0\u8425\u7ef4\u62a4\u6d41\u7a0b\u5bf9\u9f50</text>

  <!-- support -->
  <text x="48" y="432" font-family="Microsoft YaHei UI, PingFang SC, sans-serif" font-size="13" font-weight="600" fill="#334155">{U["sup"]}</text>
  {box(40, 444, 885, 72, "#f8fafc", "#64748b", "", [])}
  <text x="56" y="468" font-family="Microsoft YaHei UI, PingFang SC, sans-serif" font-size="10.5" fill="#334155">\u2022 {U["supa"]}</text>
  <text x="56" y="486" font-family="Microsoft YaHei UI, PingFang SC, sans-serif" font-size="10.5" fill="#334155">\u2022 {U["supb"]}</text>
  <text x="480" y="468" font-family="Microsoft YaHei UI, PingFang SC, sans-serif" font-size="10.5" fill="#334155">\u2022 {U["supc"]}</text>
  <text x="480" y="486" font-family="Microsoft YaHei UI, PingFang SC, sans-serif" font-size="10.5" fill="#334155">\u2022 {U["supd"]}</text>

  <!-- legend -->
  <rect x="40" y="544" width="885" height="64" rx="8" fill="#ffffff" stroke="#e2e8f0"/>
  <text x="56" y="572" font-family="Microsoft YaHei UI, PingFang SC, sans-serif" font-size="10" fill="#475569">
    \u8bf4\u660e\uff1a\u4e0a\u65b9\u56db\u533a\u4e3a C \u7aef\u7528\u6237\u4e3b\u6d41\u7a0b\uff08\u9996\u9875\u2192\u7535\u5f71\u2192\u5f71\u9662\u2192\u6211\u7684\uff09\uff1b\u4e2d\u90e8\u4e3a\u8fd0\u8425\u7ba1\u7406\uff1b\u5e95\u90e8\u4e3a\u540e\u7aef\u4e0e\u7b2c\u4e09\u65b9\u534f\u540c\u3002\u9ed8\u8ba4 USE_BACKEND_ONLY=true \u8d70 Express + MySQL\u3002
  </text>
  <text x="56" y="592" font-family="Microsoft YaHei UI, PingFang SC, sans-serif" font-size="10" fill="#475569">
    \u91cd\u751f\u6210\uff1a python movie-ticket-miniprogram/docs/_write_functional_design_svg.py
  </text>
</svg>
'''

    for path in (_desktop, _repo):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(svg)
        print("Wrote", path)


if __name__ == "__main__":
    main()
