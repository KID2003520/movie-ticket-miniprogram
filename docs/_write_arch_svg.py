# -*- coding: utf-8 -*-
"""Emit UTF-8 SVG with Chinese via \\u escapes (ASCII source -> correct output)."""
import os

_desktop = os.path.join(
    os.path.expanduser("~"),
    "Desktop",
    "毕业论文",
    "er图",
    "电影票系统-架构图.svg",
)
_repo = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "电影票系统-架构图.svg",
)

# Chinese via Unicode escapes (file stays ASCII-only)
T = {
    "title": "\u7535\u5f71\u7968\u9884\u8ba2\u7cfb\u7edf - \u603b\u4f53\u67b6\u6784",
    "sub": "\u5fae\u4fe1\u5c0f\u7a0b\u5e8f / Node.js \u670d\u52a1\u7aef / MySQL / \u7b2c\u4e09\u65b9\u63a5\u53e3\uff08TMDB\u3001\u652f\u4ed8\u5b9d\u7b49\uff09",
    "layer_u": "\u7528\u6237\u5c42",
    "wx": "\u5fae\u4fe1\u5c0f\u7a0b\u5e8f\u5ba2\u6237\u7aef",
    "wx_s": "\u8d2d\u7968\u3001\u9009\u5ea7\u3001\u8ba2\u5355\u3001\u652f\u4ed8\u5165\u53e3",
    "adm": "\u6d4f\u89c8\u5668\u7ba1\u7406\u540e\u53f0",
    "adm_s": "/admin-web \u9759\u6001\u7ba1\u7406\u9875",
    "cloud": "\u53ef\u9009\uff1a\u5fae\u4fe1\u4e91\u5f00\u53d1",
    "cloud_s": "USE_BACKEND_ONLY=false \u65f6\uff1a\u4e91\u51fd\u6570\u3001\u4e91\u6570\u636e\u5e93\u3001\u4e91\u5b58\u50a8",
    "app": "\u5e94\u7528\u670d\u52a1\u5c42\uff08Express\uff09",
    "api": "REST API / HTTPS/HTTP / CORS / \u4e1a\u52a1\u7f16\u6392",
    "api_s": "\u8def\u7531\uff1a\u7535\u5f71\u3001\u5f71\u9662\u3001\u6392\u671f\u3001\u5ea7\u4f4d\u3001\u8ba2\u5355\u3001\u652f\u4ed8\uff1bTMDB \u540c\u6b65\uff1b\u6d77\u62a5\u4ee3\u7406",
    "pay": "\u8ba2\u5355\u4e0e\u652f\u4ed8",
    "pay_s": "\u652f\u4ed8\u5b9d SDK\u3001\u56de\u8c03\u3001mock \u652f\u4ed8",
    "sync": "\u5185\u5bb9\u4e0e\u540c\u6b65",
    "sync_s": "TMDB \u5bfc\u5165\u3001\u5f71\u9662\u6837\u672c\u3001\u6269\u5c55\u63a5\u53e3",
    "ops": "\u8fd0\u8425\u4e0e\u6269\u5c55",
    "ops_s": "\u4f18\u60e0\u5238\u3001\u62a5\u8868\u7b49\u6269\u5c55\u6a21\u5757",
    "data": "\u6570\u636e\u6301\u4e45\u5c42",
    "mysql_s": "\u7528\u6237\u3001\u7535\u5f71\u3001\u5f71\u9662\u3001\u6392\u671f\u3001\u5ea7\u4f4d\u3001\u8ba2\u5355\u3001\u8bc4\u8bba\u3001\u6536\u85cf\u7b49",
    "ext": "\u5916\u90e8\u670d\u52a1",
    "tmdb_s": "\u5f71\u7247\u5143\u6570\u636e",
    "ali": "\u652f\u4ed8\u5b9d",
    "ali_s": "\u652f\u4ed8\u6536\u94f6\u53f0",
    "map": "\u817e\u8baf\u5730\u56fe\u7b49",
    "map_s": "\u5b9a\u4f4d\u9006\u5730\u7406\uff08\u53ef\u9009\uff09",
    "leg1": "\u8bf4\u660e\uff1a\u9ed8\u8ba4 USE_BACKEND_ONLY=true\uff0c\u5c0f\u7a0b\u5e8f\u901a\u8fc7 BACKEND_BASE_URL \u8bbf\u95ee backend\uff08Express\uff09\uff1b\u865a\u7ebf\u8868\u793a\u53ef\u9009\u4e91\u5f00\u53d1\u8def\u5f84\u3002",
    "leg2": "\u672c\u6587\u4ef6\u4e3a UTF-8 \u7f16\u7801\u7684 SVG\uff0c\u53ef\u7528\u6d4f\u89c8\u5668\u9884\u89c8\uff1b\u63d2\u5165 WPS \u82e5\u5f02\u5e38\u8bf7\u5bfc\u51fa\u4e3a PNG\u3002",
}

svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="920" height="640" viewBox="0 0 920 640">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#f8fafc"/>
      <stop offset="100%" style="stop-color:#e2e8f0"/>
    </linearGradient>
    <filter id="shadow" x="-2%" y="-2%" width="104%" height="104%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.12"/>
    </filter>
    <style type="text/css"><![CDATA[
      .title {{ font-family: "Microsoft YaHei UI", "PingFang SC", "SimHei", sans-serif; font-size: 22px; font-weight: 700; fill: #0f172a; }}
      .subtitle {{ font-family: "Microsoft YaHei UI", "PingFang SC", sans-serif; font-size: 12px; fill: #64748b; }}
      .layer {{ font-family: "Microsoft YaHei UI", "PingFang SC", sans-serif; font-size: 13px; font-weight: 600; fill: #334155; }}
      .box {{ font-family: "Microsoft YaHei UI", "PingFang SC", sans-serif; font-size: 11px; fill: #1e293b; }}
      .small {{ font-size: 10px; fill: #475569; }}
      .arrow {{ stroke: #64748b; stroke-width: 1.6; fill: none; marker-end: url(#arrowhead); }}
      .arrow-dashed {{ stroke: #94a3b8; stroke-width: 1.4; stroke-dasharray: 6 4; fill: none; marker-end: url(#arrowhead-soft); }}
    ]]></style>
    <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
      <polygon points="0 0, 8 4, 0 8" fill="#64748b"/>
    </marker>
    <marker id="arrowhead-soft" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
      <polygon points="0 0, 8 4, 0 8" fill="#94a3b8"/>
    </marker>
  </defs>

  <rect width="100%" height="100%" fill="url(#bg)"/>

  <text x="460" y="42" text-anchor="middle" class="title">{T["title"]}</text>
  <text x="460" y="64" text-anchor="middle" class="subtitle">{T["sub"]}</text>

  <rect x="40" y="88" width="840" height="110" rx="10" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="60" y="112" class="layer">{T["layer_u"]}</text>
  <rect x="70" y="128" width="200" height="56" rx="8" fill="#dbeafe" stroke="#3b82f6"/>
  <text x="170" y="152" text-anchor="middle" class="box">{T["wx"]}</text>
  <text x="170" y="168" text-anchor="middle" class="small">{T["wx_s"]}</text>
  <rect x="320" y="128" width="200" height="56" rx="8" fill="#e0e7ff" stroke="#6366f1"/>
  <text x="420" y="152" text-anchor="middle" class="box">{T["adm"]}</text>
  <text x="420" y="168" text-anchor="middle" class="small">{T["adm_s"]}</text>
  <rect x="570" y="128" width="280" height="56" rx="8" fill="#f1f5f9" stroke="#94a3b8"/>
  <text x="710" y="152" text-anchor="middle" class="box">{T["cloud"]}</text>
  <text x="710" y="168" text-anchor="middle" class="small">{T["cloud_s"]}</text>

  <rect x="40" y="228" width="840" height="160" rx="10" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="60" y="252" class="layer">{T["app"]}</text>
  <rect x="70" y="268" width="780" height="44" rx="8" fill="#ecfdf5" stroke="#10b981"/>
  <text x="460" y="287" text-anchor="middle" class="box">{T["api"]}</text>
  <text x="460" y="302" text-anchor="middle" class="small">{T["api_s"]}</text>
  <rect x="70" y="324" width="240" height="50" rx="8" fill="#fff7ed" stroke="#f97316"/>
  <text x="190" y="348" text-anchor="middle" class="box">{T["pay"]}</text>
  <text x="190" y="362" text-anchor="middle" class="small">{T["pay_s"]}</text>
  <rect x="335" y="324" width="240" height="50" rx="8" fill="#fef3c7" stroke="#eab308"/>
  <text x="455" y="348" text-anchor="middle" class="box">{T["sync"]}</text>
  <text x="455" y="362" text-anchor="middle" class="small">{T["sync_s"]}</text>
  <rect x="600" y="324" width="250" height="50" rx="8" fill="#fce7f3" stroke="#db2777"/>
  <text x="725" y="348" text-anchor="middle" class="box">{T["ops"]}</text>
  <text x="725" y="362" text-anchor="middle" class="small">{T["ops_s"]}</text>

  <rect x="40" y="418" width="380" height="120" rx="10" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="60" y="442" class="layer">{T["data"]}</text>
  <rect x="70" y="458" width="320" height="66" rx="8" fill="#f0fdf4" stroke="#22c55e"/>
  <text x="230" y="486" text-anchor="middle" class="box">MySQL</text>
  <text x="230" y="504" text-anchor="middle" class="small">{T["mysql_s"]}</text>

  <rect x="440" y="418" width="440" height="120" rx="10" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="460" y="442" class="layer">{T["ext"]}</text>
  <rect x="460" y="458" width="120" height="52" rx="8" fill="#eff6ff" stroke="#2563eb"/>
  <text x="520" y="482" text-anchor="middle" class="box">TMDB API</text>
  <text x="520" y="498" text-anchor="middle" class="small">{T["tmdb_s"]}</text>
  <rect x="595" y="458" width="120" height="52" rx="8" fill="#fff1f2" stroke="#e11d48"/>
  <text x="655" y="482" text-anchor="middle" class="box">{T["ali"]}</text>
  <text x="655" y="498" text-anchor="middle" class="small">{T["ali_s"]}</text>
  <rect x="730" y="458" width="130" height="52" rx="8" fill="#f8fafc" stroke="#64748b"/>
  <text x="795" y="482" text-anchor="middle" class="box">{T["map"]}</text>
  <text x="795" y="498" text-anchor="middle" class="small">{T["map_s"]}</text>

  <path class="arrow" d="M 170 184 L 170 228"/>
  <path class="arrow" d="M 420 184 L 420 228"/>
  <path class="arrow-dashed" d="M 710 184 L 710 228"/>
  <text x="185" y="210" class="small">HTTPS</text>
  <text x="435" y="210" class="small">HTTP(S)</text>

  <path class="arrow" d="M 230 388 L 230 418"/>
  <path class="arrow" d="M 455 388 L 280 418"/>
  <path class="arrow" d="M 725 388 L 320 418"/>

  <path class="arrow" d="M 455 324 L 520 418"/>
  <path class="arrow" d="M 190 324 L 655 458"/>
  <path class="arrow" d="M 725 324 L 795 458"/>

  <rect x="40" y="566" width="840" height="54" rx="8" fill="#ffffff" stroke="#e2e8f0"/>
  <text x="60" y="592" class="small">{T["leg1"]}</text>
  <text x="60" y="608" class="small">{T["leg2"]}</text>
</svg>
'''

def main():
    for path in (_desktop, _repo):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(svg)
        print("Wrote", path)


if __name__ == "__main__":
    main()
