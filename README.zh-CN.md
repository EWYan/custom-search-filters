<img src="media/icon.png" alt="Custom Search Filters 图标" width="80" height="80">

# Custom Search Filters

[English](README.md) | **简体中文**

为 VS Code 原生文件搜索保存可重复使用的包含与排除规则。快速切换搜索范围、组合多个过滤器，并将常用排除规则设为常驻。

- **保存过滤器**：全局复用，或随项目共享。
- **多选面板**：通过复选框组合过滤器，预览后再执行搜索。
- **常驻过滤器**：自动参与插件发起的搜索。
- **资源管理器操作**：从选中的文件夹或文件类型创建规则。

[快速上手](#快速上手) · [使用方式](#使用方式) · [规则与合并](#规则与合并) · [配置与存储](#配置与存储) · [常见问题](#常见问题)

文档保留命令和字段的英文名称，便于与插件界面对照。

## 安装

需要 **VS Code 1.96.2 或更高版本**。本文说明 **1.1.x** 的功能。

通过 [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=juzidaxia.custom-search-filters) 安装，或在扩展视图搜索 `@id:juzidaxia.custom-search-filters`。安装本地构建时，运行 **Extensions: Install from VSIX...**，选择对应的 `.vsix` 文件。参见 [VS Code 安装说明](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace#install-from-a-vsix)。

如果已安装版本没有多选面板或固定操作，请安装 1.1.x 构建。

## 快速上手

1. 打开项目文件夹或工作区，按 **Ctrl+Shift+P**（macOS 为 **Cmd+Shift+P**）打开命令面板。
2. 执行 **Custom Search: Add Filter**。名称输入 `TypeScript`，**Include** 输入 `**/*.ts`，**Exclude** 留空，作用域选择 **Global**。
3. 打开 VS Code 搜索视图，输入要查找的文本。
4. 执行 **Custom Search: Select Filter and Search**，选择 **TypeScript**。插件会填充 **files to include** 和 **files to exclude**，并执行搜索。

也可以点击搜索视图或编辑器标题栏中的过滤器图标，打开选择列表。

## 使用方式

### 在面板中组合过滤器

运行 **Custom Search: Show Filters Panel**，或点击搜索视图标题栏中的树形列表图标。**Search Filters** 面板按 **Global** 和各项目分组展示过滤器。

1. 勾选需要使用的过滤器。
2. 查看 **Include** 和 **Exclude** 预览，其中也包含常驻规则。
3. 点击 **Apply Selected Filters**（播放图标）执行搜索。

勾选只更新预览，点击 **Apply** 才会搜索。完全相同的包含与排除规则会显示为 **Overlap (excluded)**，最终按排除处理。禁用的过滤器仍可见，但没有复选框。

**Clear Filter Selection** 只清除勾选。随后点击 Apply，会仅使用常驻过滤器；如果没有启用的常驻过滤器，则清空搜索的两个路径字段。每次 Apply 都会替换手动填写的包含与排除规则。

勾选状态按工作区保存，重新打开工作区会恢复，但不会自动搜索。

<!-- 截图位置（media/screenshots/filters-panel.png）：Search Filters 面板勾选两个过滤器、固定一个排除过滤器，同时展示 Apply 后的原生搜索字段。 -->

### 将常用规则设为常驻（Pinned）

在面板或搜索选择列表中点击过滤器的固定按钮，或在编辑器中切换 **Pinned** 后保存。常驻过滤器会自动参与插件发起的每次搜索。

例如，创建 `Skip dependencies and builds`：**Include** 留空，**Exclude** 填入 `**/node_modules/**,**/dist/**`。将它固定后，再选择语言或项目过滤器即可。

| 搜索操作 | 实际使用的规则 |
|---|---|
| **Apply Selected Filters** | 常驻过滤器 + 勾选的过滤器 |
| 未勾选任何项时点击 **Apply Selected Filters** | 仅常驻过滤器 |
| **Select Filter and Search** | 常驻过滤器 + 本次选择的过滤器 |
| **Search Now** 或 **Save and Search** | 常驻过滤器 + 当前过滤器 |

固定后，面板中的复选框会变成彩色图钉。固定操作会清除该项原有的勾选；取消固定后，该项保持未勾选。禁用的过滤器保留固定状态，但不会自动参与搜索；显式执行 **Save and Search** 仍会使用正在编辑的过滤器。

固定和勾选状态均保存在当前工作区。通过插件重命名会保留状态，通过插件删除会清除状态；禁用过滤器会清除它的勾选状态。

<!-- 截图位置（media/screenshots/filter-picker.png）：Select Filter and Search 列表，展示紧凑的内置项、用户过滤器和固定状态。 -->

### 搜索工作区全部文件

**All Workspace Files** 是位于列表顶部的内置只读过滤器，包含规则为 `**/*`，排除规则为空，默认未勾选、未固定。

选择或固定它会将包含范围扩展到工作区的所有根目录。其他过滤器的排除规则，以及 VS Code 自身的搜索排除和忽略文件行为仍然生效。它带有 **Built-in** 标记，不能编辑、删除，也不能作为资源管理器添加规则的保存目标。

### 清空当前搜索

执行 **Search: Clear Search Results**，或点击搜索视图标题栏中的清除按钮。搜索或替换框有文本时，会清空这两个字段和搜索结果；在这两个字段均为空时再执行一次，会继续清空 **files to include** 和 **files to exclude**。参见 [VS Code 命令行为](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/search/browser/searchView.ts#L1274-L1308)。

该操作保留插件的勾选与固定状态，下次 **Apply** 会重新填入对应规则。**Clear Filter Selection** 仅清除面板中的勾选。

### 从资源管理器添加规则

在资源管理器中选中一个或多个文件夹、文件，右键打开 **Search Filters**：

| 选中内容 | 操作 | 生成的规则示例 |
|---|---|---|
| 文件夹 | **Include Folder...**、**Exclude Folder...** | 项目过滤器中为 `./src/utils/**/*` |
| 带扩展名的文件 | **Include File Type...**、**Exclude File Type...** | `**/*.ts` |

选择已有过滤器会追加规则；点击该项的替换按钮可替换对应列表；选择 **New Filter...** 则继续选择作用域并输入名称。文件夹默认选择 **Current Project**，文件类型默认选择 **Global**。跨多个工作区根目录添加文件夹时，使用 Global。

重复规则会跳过。如果同一规则已存在于另一侧列表，会将其移出，避免同时包含和排除。完成后可选择 **Search Now**、**Edit Filter** 或 **Undo**；撤销前会检查是否存在后续修改。

这些操作依赖资源管理器中的选择，因此只在其右键菜单中提供。

### 编辑已保存的过滤器

执行 **Custom Search: Edit Filter**，或点击过滤器旁的铅笔按钮。修改 **Name**、**Include**、**Exclude**、**Enabled** 或 **Pinned**，然后选择 **Save** 或 **Save and Search**。保存前的修改属于草稿，可通过 **Discard Changes** 放弃。

包含多个规则时，**Choose Patterns to Keep** 支持通过复选框移除不再需要的项。禁用的过滤器仍可编辑，但不会出现在搜索选择列表中。

## 规则与合并

| 目标 | Include | Exclude |
|---|---|---|
| TypeScript 文件 | `**/*.ts` | 留空 |
| C/C++ 源码和头文件 | `**/*.{c,h,cpp,hpp}` | 留空 |
| 项目根目录下的 `src`，排除测试 | `./src/**/*` | `**/*.{test,spec}.ts` |
| 可复用的排除规则 | 留空 | `**/node_modules/**,**/dist/**` |

路径使用正斜杠，多个规则之间用逗号分隔。`**/*.{ts,js}` 这样的花括号分组会保持完整。

- **多个过滤器的 Include 按 OR 合并**：选择包含 `./src/**/*` 的项目过滤器和包含 `**/*.ts` 的全局过滤器，会搜索该项目 `src` 内的文件，**以及**其他位置的 TypeScript 文件。若只想搜索 `src` 中的 TypeScript 文件，在一个项目过滤器中使用 `./src/**/*.ts`。
- **所有 Exclude 都作用于合并后的范围**，排除优先于包含。
- **仅含排除规则的过滤器不会扩大包含范围**。如果所有过滤器的 Include 都为空，搜索的包含字段也保持为空。
- **只有一个过滤器提供 Include 时，保留 VS Code 原生解释方式**，包括 `./src,**/*.ts` 这样的路径与 glob 组合。多个过滤器提供 Include 时会合并规则列表，并去除重复项；不会分别执行每个过滤器的搜索再合并结果。

项目规则中的 `src/**/*` 会递归匹配，`./src/**/*` 则定位项目根目录下的 `src`。在多根工作区中，插件会在搜索时补上当前根目录名称，因此同一份项目过滤器在单独打开项目时仍可使用。绝对路径与 `~/projects/lib` 等主目录相对路径沿用原生搜索行为。

底层规则参见 [VS Code 搜索语法](https://code.visualstudio.com/docs/editing/codebasics#advanced-search-options)。

## 配置与存储

| 数据 | 存储位置 | 共享方式 |
|---|---|---|
| 全局过滤器和启用状态 | VS Code **User** 设置 | 可通过 Settings Sync 同步 |
| 项目过滤器 | 各工作区根目录的 `.vscode/custom-search-filters.json` | 提交文件到仓库以共享 |
| 勾选与固定状态 | VS Code 工作区状态 | 仅本地保存，不同步、不提交 |

同一作用域内的名称必须唯一；不同项目和 Global 可以使用同名过滤器。全局过滤器及其启用状态只读取 **User 设置**，工作区或文件夹级别的覆盖值会被忽略。

### 全局过滤器

将以下配置合并到 **用户设置 JSON**：

```json
{
  "custom-search-filters.globalFilters": [
    {
      "name": "TypeScript",
      "include": "**/*.ts",
      "exclude": ""
    },
    {
      "name": "Skip dependencies and builds",
      "include": "",
      "exclude": "**/node_modules/**,**/dist/**"
    }
  ],
  "custom-search-filters.globalFiltersEnabled": {
    "TypeScript": true,
    "Skip dependencies and builds": true
  }
}
```

全局过滤器默认启用。将 `globalFiltersEnabled` 中对应名称的值设为 `false` 即可禁用。

### 项目过滤器

在项目根目录创建 `.vscode/custom-search-filters.json`：

```json
[
  {
    "name": "Source",
    "include": "./src/**/*",
    "exclude": "**/*.{test,spec}.ts",
    "enabled": true
  }
]
```

文件必须是 JSON 数组，不支持注释或尾随逗号。设置 `"enabled": false` 可禁用对应过滤器。修改设置或项目文件后，面板会自动刷新。

### 图钉颜色

可将以下自定义颜色合并到用户设置：

```json
{
  "workbench.colorCustomizations": {
    "customSearchFilters.pinnedForeground": "#ff8800"
  }
}
```

默认颜色跟随主题。图钉会显示颜色；名称着色还需要启用 `explorer.decorations.colors`。

## 命令速查

打开命令面板，输入 **Custom Search**。

| 命令 | 用途 |
|---|---|
| **Add Filter** | 创建全局或项目过滤器 |
| **Select Filter and Search** | 使用一个过滤器和已启用的常驻规则搜索 |
| **Show Filters Panel** | 打开多选面板 |
| **Apply Selected Filters** | 应用勾选项和已启用的常驻规则 |
| **Clear Filter Selection** | 清除勾选，不执行搜索 |
| **Refresh Filters** | 重新读取设置和项目文件 |
| **Edit Filter** | 编辑或启用已保存的过滤器 |
| **Delete Filter** | 删除已保存的过滤器 |
| **Recover Legacy Filters** | 从保留的旧数据中恢复缺失过滤器 |

## 从 0.2.2 升级

已有的用户设置和项目 JSON 无需转换格式，名称和启用状态会保留。显式配置的用户设置优先于旧数据，包括空的过滤器列表。如果之前将全局过滤器配置写在工作区设置中，需要迁移到 **用户设置**。

如果更早的迁移曾导致过滤器丢失，可执行 **Custom Search: Recover Legacy Filters**。确认后，它会从保留的快照中恢复缺失名称，并保留已有过滤器及启用状态。恢复可能带回曾主动删除的过滤器，请按需使用；如果没有可用快照，命令会提示无旧数据可恢复。

## 常见问题

| 现象 | 检查方式 |
|---|---|
| 勾选后搜索没有变化 | 查看预览后点击 **Apply Selected Filters**。 |
| 搜索范围比预期大 | 检查常驻项和 **All Workspace Files**；多个 Include 按 OR 合并。 |
| 选择 **All Workspace Files** 后仍缺少文件 | 检查 **Exclude**、`.gitignore`、`files.exclude`、`search.exclude`，以及搜索视图的 **Use Exclude Settings and Ignore Files** 开关。参见 [VS Code 搜索选项](https://code.visualstudio.com/docs/editing/codebasics#advanced-search-options)。 |
| 项目过滤器加载失败 | 修复提示中的 JSON 文件或读取权限后刷新。面板会保留之前的过滤器和勾选；需要重新加载过滤器的搜索和编辑操作会停止，直到文件恢复可读。 |
| 删除后重建的过滤器自动变成常驻 | 直接修改设置或 JSON 会保留固定标识，可手动取消固定；通过插件删除则会同时清除固定状态。 |

应用过滤器会保留正则、大小写敏感和全词匹配选项。搜索焦点由 VS Code 控制，查询文本可能取自编辑器的选中文字。`search.mode` 决定结果在搜索视图还是 Search Editor 中打开；设置 `"search.mode": "view"` 可使用侧栏搜索视图。

## 开发

在仓库根目录执行：

| 命令 | 用途 |
|---|---|
| `npm ci` | 按锁文件安装开发依赖 |
| `npm run compile` | 将 TypeScript 编译到 `out/` |
| `npm run watch` | 源码变化时重新编译 |
| `npm run lint` | 运行 ESLint |
| `npm test` | 编译、检查并运行扩展宿主测试 |

在 VS Code 的 **Run and Debug** 中选择 **Run Custom Search Filters**，按 **F5**。启动配置会先编译，再打开 **Extension Development Host**；可在 `src/` 中设置断点。

`vscode` API 由扩展宿主提供。直接运行 `node out/extension.js` 或对入口文件使用 **Run Code** 会产生 `Cannot find module 'vscode'`。测试可能下载 VS Code，并在临时的单文件夹和多根工作区中验证原生搜索结果。

[反馈问题](https://github.com/EWYan/custom-search-filters/issues) 时，请附上插件与 VS Code 版本、工作区结构、相关规则和复现步骤。版本变化见 [更新日志](CHANGELOG.md)。本项目采用 [MIT 许可证](LICENSE)。
