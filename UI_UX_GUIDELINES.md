# Snotra 项目 UI/UX 开发指南 (2026-05-20 更新)

本指南旨在记录当前项目的 UI 规范、核心技术栈及组件库使用约定，供 AI 助手及开发人员参考，以确保视觉风格和代码实现的统一性。

## 1. 核心技术栈
- **框架**: React 19 + Tauri v2
- **样式**: Tailwind CSS v4 (使用 `@tailwindcss/vite` 插件)
- **UI 组件库**: **HeroUI v3** (原 NextUI) —— *注：v3 相比 v2 有重大 API 变更，基于 React Aria 架构。*
- **图标**: Lucide React
- **动效**: Framer Motion + Tailwind CSS 动画

## 2. 视觉风格指南 (高级感极简主义)
- **色调**: 亮色优先，强调克制感。
- **圆角 (Border Radius)**: 
  - 全局标准圆角: `12px` (`--radius-lg`)。
  - 对话气泡 (非对称): 
    - 用户: `rounded-[20px_6px_20px_20px]`
    - 助手: `rounded-[6px_20px_20px_20px]`
- **质感**: 大量使用磨砂玻璃效果 (`glass-card`)，背景色为半透明 `bg-surface/XX backdrop-blur-xl`。
- **边框**: 极细边框 (`border-(--color-border-light)`)，尽量避免粗重的边框线。

## 3. 核心组件库使用约定 (HeroUI v3)

### 3.1 输入控件 (Input / TextArea)
HeroUI v3 采用原子化的复合组件模式，必须使用容器包裹：
```tsx
import { TextField, TextArea } from "@heroui/react"

// 正确用法：value 和 onChange 挂在 TextField 上
<TextField value={input} onChange={setInput} isDisabled={disabled}>
  <TextArea 
    className="..." 
    placeholder="..."
    rows={1}
  />
</TextField>
```

### 3.2 列表容器 (ListBox)
注意：HeroUI v3 中是 `ListBox` (大写 B)，且推荐使用 `items` 属性：
```tsx
import { ListBox, ListBoxItem } from "@heroui/react"

<ListBox items={data}>
  {(item) => (
    <ListBoxItem key={item.id} textValue={item.title}>
      {item.title}
    </ListBoxItem>
  )}
</ListBox>
```

### 3.3 选择器 (Select)
需要使用完整的复合组件结构，不再支持简单的单标签写法：
```tsx
import { Select, SelectTrigger, SelectValue, SelectPopover, ListBox, ListBoxItem } from "@heroui/react"

<Select>
  <SelectTrigger><SelectValue /></SelectTrigger>
  <SelectPopover>
    <ListBox>
      <ListBoxItem>Option 1</ListBoxItem>
    </ListBox>
  </SelectPopover>
</Select>
```

## 4. 关键文件索引
- **全局样式**: [globals.css](file:///c:/Users/tszyk/Desktop/caihonqiao/Snotra/src/styles/globals.css) —— 定义了所有 Design Tokens (颜色、圆角、变量)。
- **基础组件封装**: [src/components/ui/](file:///c:/Users/tszyk/Desktop/caihonqiao/Snotra/src/components/ui/) —— 对 HeroUI 进行的二次封装 (Button, Card, Input 等)。
- **布局约束**: [App.tsx](file:///c:/Users/tszyk/Desktop/caihonqiao/Snotra/src/App.tsx) —— 维护侧边栏、聊天区、工作区的三栏无缝布局。

## 5. 避坑指南 (AI 专用)
1. **不要手搓复杂组件**: 优先查找 HeroUI 是否有对应组件，特别是具有复杂状态的 (Select, Modal, Popover)。
2. **严禁使用旧版属性**: 
   - 使用 `isDisabled` 而非 `disabled`。
   - 使用 `ListBox` 而非 `Listbox`。
   - 使用 `Separator` 而非 `Divider`。
3. **气泡留白处理**: 气泡内第一个和最后一个元素的外边距必须为 0，防止视觉上的多余留白。
4. **输入框布局**: 聊天输入框最大宽度建议限制在 `880px` 左右，不要抵住屏幕两侧。
