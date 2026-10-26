# 当前 AI 提示词

更新时间：2026-10-25

## 生成链路

```text
generateWithAi()
  → prepareReferenceImage()      主体裁切，再按目标比例居中裁剪
  → buildAgnesPrompt()
  → generateAgnesImages()        size=1K，附带 ratio，可选 1–4 张并行候选
  → cropSubjectFromImage()
  → quantizeToPalette()          Lab 距离、k-means 选色、可选去背景 / 抖动 / 孤立豆清理
```

## 提示词结构

`src/agnes/styles.ts` 的 `buildAgnesPrompt()` 按顺序拼接：

1. 风格预设一句话（Q 版、复古游戏精灵、扁平图标、写实简化）
2. 保留第一张参考图的主体、姿态和关键特征
3. 用户补充描述
4. 渲染要求：粗轮廓、纯色填充、有限配色，把渐变和阴影换成平涂，去掉背景并换成单一纯色
5. 构图：跟随原图 / 头像 / 半身 / 全身。跟随原图时要求不补出参考图里没有的身体部位；头像固定 1:1
6. 按图纸宽度追加简化等级（≤32 图标级，≤56 大色块）
6. 颜色上限 ≤16 时追加 “two-tone shading at most”
7. 构图：主体居中并占满画面
8. 有效果参考图时，说明第二张只提供风格
9. 用户填写的补充指令

旧的 6 个风格 id 里，`pixel-classic` 映射到扁平图标，`perler-craft` 映射到复古游戏精灵。默认补充指令为空。
