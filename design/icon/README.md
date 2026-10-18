# 小程序头像

生成方式：`python make_icon.py`（纯 Pillow 绘制，4 倍超采样后降采样，无外部素材）。

## 推荐

**方案 B · 递增柱 + 星** → 上传 `icon-b-bars-144.png`

理由：

| 维度 | 判断 |
|---|---|
| 语义 | 三根递增柱 = 榜单/排名，星 = 热度，直接对上「Trending 榜单」 |
| 小尺寸 | 96/72/48/32 px 下剪影依然清楚（见 `icon-sheet-v3.png` 第三行） |
| 撞脸风险 | 低。↗ 箭头（方案 A）被下载器、加速器、VPN 用滥了 |
| 与 App 一致 | 深底 `#070a0e→#11161f` + 绿→蓝渐变，和小程序 UI 同一套颜色语言 |

备选：**方案 A · 箭头折线** 更强调「上升」，如果你更想要冲击力就选它。

## 文件

| 文件 | 用途 |
|---|---|
| `icon-b-bars-144.png` | **上传用**，144×144，9 KB |
| `icon-b-bars.png` | 1024×1024 母版，留着以后改色/导出其他尺寸 |
| `icon-a-arrow.png` / `-144.png` | 备选方案 A |
| `icon-c-star.png` / `-144.png` | 备选方案 C |
| `icon-sheet-v3.png` | 全部方案 × 多尺寸 × 圆形/剪影 × 浅色底对照 |
| `make_icon.py` | 生成脚本，改颜色/形状重跑即可 |

## 符合微信要求

- 正方形、144×144（微信要求 ≥144×144）
- PNG，单文件 < 20 KB（上限 2 MB）
- 满幅填充无透明边角，圆角/圆形遮罩下都不会露白
- 主体占画面约 72%，缩到 48 px 仍能认出

## 改法

```python
# make_icon.py 顶部
BG_TOP = (17, 23, 32)     # 背景上
BG_BOT = (7, 10, 14)      # 背景下
GREEN  = (63, 185, 80)    # 起色（低柱）
TEAL   = (52, 190, 168)   # 中间柱
BLUE   = (79, 156, 249)   # 高柱 / 强调色
```

`variant_b()` 里调 `bars` 三根柱的 `(x, top, width, color)` 与 `bottom`，`star_pts(658, 150, 122, 51)` 调星的位置和大小。

改完重新执行：

```powershell
cd G:\newscollecting\GithubTrending\design\icon
F:\python\python.exe make_icon.py
```
