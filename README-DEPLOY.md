# 迁移部署说明：GitHub Pages + Supabase

这个目录是把现有城市测评迁移到「静态前端 + Supabase」的完整产物。按本文顺序操作即可上线；文末的「需要你手动操作的清单」是必须由你本人完成的停点。

## 1. 目录与职责

```
cloud/
├─ docs/                          ← 只把这一层发布到 GitHub Pages
│  ├─ index.html                  输入卡密 / 恢复进度
│  ├─ test.html                   50 题答题
│  ├─ result.html                 结果页（读取 ?r=<id>）
│  ├─ admin.html                  管理后台（Supabase Auth 登录后才有内容）
│  ├─ 404.html                    GitHub Pages 深链接回退：/r/<id> → result.html?r=<id>
│  ├─ config.js                   ★ 唯一需要你填写的环境配置
│  ├─ .nojekyll                   关闭 Jekyll，保证 _ 开头文件与目录原样发布
│  ├─ data/questions.json         公开题库（已剥离分值）
│  └─ assets/                     style / app / test / result / admin / cloud / radar / share-card
├─ supabase/
│  ├─ migrations/0001_init.sql    建表 + 索引 + RLS + 兑换/读取/落库/管理函数
│  ├─ legacy_import.sql           旧本地数据导入（43 卡密 / 23 会话 / 23 结果）
│  └─ functions/
│     ├─ submit/index.ts          Edge Function 源码（CLI 部署用）
│     ├─ submit/standalone.ts     单文件版（Dashboard 粘贴用，由脚本生成）
│     └─ _shared/                 model.js（十维模型与 41 城坐标）+ scoring.js（可信计分）
└─ scripts/build_cloud.py         从 Python 模型重新生成上面这些产物
```

## 2. 安全边界（先看这段）

| 位置 | 能力 | 说明 |
| --- | --- | --- |
| 前端 `docs/` | 只有 anon key | 只能调 `redeem_card` / `get_result` 两个 RPC 和 `submit` 函数 |
| `cards` 表 | 匿名无任何 select | 只有 `is_admin()` 为真的登录用户能读 |
| `sessions` / `results` 表 | 匿名与普通用户都不能直读 | 结果只能通过 `get_result(id)` 取单条，没有列表接口 |
| `redeem_card()` | 匿名可调 | 单条 `update ... where status='unused'` 原子占位，并发只有一个成功 |
| `finalize_result()` | 仅 service_role | 由 Edge Function 调用；评分与写库都在服务端 |
| `admin_*()` | 仅 admins 表中的登录用户 | 生成卡密、统计、导出数据都走鉴权函数 |
| service_role | 只存在于 Edge Function 运行环境 | 绝不写进 `config.js` 或任何前端文件 |

评分逻辑（十维计分、匹配度、城市排序）只存在于 `supabase/functions/_shared/`，前端 `docs/data/questions.json` 不含任何分值。改前端改不出分数。

## 3. 需要你手动操作的清单（停在这里等我）

下面每一项都需要账号或后台登录，我无法代替你完成。做完一项把结果发我，我继续下一步。

### A. Supabase

1. 打开 https://supabase.com 注册 / 登录。
2. 新建项目（New project）：填项目名、数据库密码（自己保管）、选择区域（建议 Northeast Asia (Tokyo) 或 Singapore）。
3. 等 1–2 分钟项目初始化完成。
4. 进入 Project Settings → API，记录两项：
   - `Project URL`，形如 `https://xxxxxxxx.supabase.co`
   - `anon public` key（一长串 JWT）
   - **不要复制 `service_role`**，它不需要出现在任何前端文件里。
5. 打开 SQL Editor，按顺序执行：
   - 先整段执行 `supabase/migrations/0001_init.sql`
   - 再整段执行 `supabase/legacy_import.sql`（导入旧卡密与旧结果；可重复执行）
   - 校验：
     ```sql
     select status, count(*) from public.cards group by status;
     select count(*) from public.results;
     ```
     预期：`unused 20 / used 23`，`results 23`。
6. 创建管理员账号：Authentication → Users → Add user（邮箱 + 密码，勾选 Auto Confirm User）。
   然后在 SQL Editor 执行（把邮箱换成你的）：
   ```sql
   insert into public.admins (user_id, email)
   select id, email from auth.users where email = '你的管理员邮箱'
   on conflict (user_id) do nothing;
   ```
7. 部署提交函数（二选一）：
   - **Dashboard 方式**：Edge Functions → Create a new function，名称必须是 `submit`；把 `supabase/functions/submit/standalone.ts` 的全部内容粘进去，Deploy。
   - **CLI 方式**：
     ```bash
     supabase login
     supabase link --project-ref <你的 project-ref>
     supabase functions deploy submit
     ```
   - 函数默认校验 JWT；前端用 anon key 调用，正常可用。若部署后调用返回 401，把该函数的 `Verify JWT` 关掉即可（函数本身不依赖 JWT，只依赖运行环境注入的 service_role）。
8. 把 `Project URL` 和 `anon key` 发我。

### B. GitHub

1. 打开 https://github.com 登录。
2. 新建仓库（New repository），例如 `city-fit`，Public 即可。
3. 把 `cloud/` 里的内容作为仓库根目录上传（`docs/`、`supabase/`、`scripts/` 都在根下）。
   - 网页上传也可以；文件较多时建议用 Git 客户端。
4. 仓库 Settings → Pages：
   - Source 选 `Deploy from a branch`
   - Branch 选 `main`，目录选 `/docs`
   - 保存后等待 1–2 分钟。
5. 把仓库地址与 Pages 地址发我（形如 `https://<用户名>.github.io/city-fit/`）。

> 注意：Pages 只发布 `docs/`，`supabase/` 不会被当成静态资源提供。仓库若是 Public，SQL 与评分源码在 GitHub 上可见，这是正常的——安全性依赖 RLS 与服务端校验，不依赖代码保密。

### C. 填写配置

拿到 URL 与 anon key 后，编辑 `docs/config.js`：

```js
window.CF_CONFIG = {
  SUPABASE_URL: "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...",
  SUBMIT_FUNCTION: "submit"
};
```

改完提交到仓库，Pages 会自动重建。`config.js` 里只允许出现这两项，任何情况下都不要放 service_role。

## 4. 深链接与子路径

- 站点部署在 `https://<用户名>.github.io/<仓库名>/`，所有页面资源都用相对路径（`assets/...`、`data/questions.json`），`cloud.js` 用自身脚本地址推导站点根，不写死域名。
- 分享链接格式：`https://<用户名>.github.io/<仓库名>/r/<id>`。
- GitHub Pages 对 `/r/<id>` 返回 `404.html`，其中脚本把路径还原成 `result.html?r=<id>`，所以复制出的链接可以直接打开、刷新、发给别人。
- 静态资源带版本号（`?v=7`）。更新 `docs/assets/*.js` 或 CSS 时同步改 HTML 里的版本号，避免用户拿到旧缓存。

## 5. 旧数据说明

`legacy_import.sql` 已包含：

| 表 | 条数 | 说明 |
| --- | --- | --- |
| `cards` | 43 | 20 条 `unused`，23 条 `used`，保留原备注与使用时间 |
| `sessions` | 23 | 与已用卡密对应 |
| `results` | 23 | 原样写入 `results.data` |

旧结果中有 9 条是十维结构，完整展示；其余是更早的旧格式，前端会自动降级成「旧版结果」：只显示城市、匹配度、结论，隐藏十维区块和保存长图，并提示重新测试。新产生的 50 题结果不受影响。

未使用卡密可直接当测试卡密，例如：**CITY-F33Z-R2W9**。

## 6. 上线后验收（我负责执行，你配合）

1. 首页输入测试卡密 → 进入答题，卡密变 `in_use`。
2. 50 题：选答后自动下一题；「上一题」返回后原选项仍高亮；题号与进度正确。
3. 答完 → 结果页出现主城市、匹配度、四组匹配理由、十维雷达与画像、其他城市、代价、不合拍城市。
4. 结果链接 `/r/<id>`：新开窗口、无痕窗口、换设备打开都是同一份结果。
5. 同一卡密再次兑换 → 提示「这个卡密已经被使用」；并发点击也只有一次成功。
6. 保存长图：桌面下载 PNG，移动端长按保存；复制链接可用；再测一次弹「卡密已经用掉了」。
7. 管理后台：未登录只有登录框、页面源码里没有卡密数据；登录非管理员提示无权限；管理员可批量生成、导出 CSV、看已用状态。

## 7. 更新与回滚

- 改题库或城市：改 `city-fit-app/` 下的 `content.py` / `cities.py` / `scoring.py`，然后运行
  ```bash
  python cloud/scripts/build_cloud.py
  ```
  会重新生成 `docs/data/questions.json`、`_shared/model.js`、`submit/standalone.ts`、`legacy_import.sql`。
  之后重跑 `0001_init.sql`（幂等）不是必须的；只需重新部署 `submit` 函数并提交 `docs/`。
- 回滚：Pages 回退到上一个提交；数据库不动，旧结果仍可读。若需清空测试数据，只删 `cards` / `sessions` / `results` 中对应记录，不要 drop 表。

## 8. 本地预检（已通过）

- 首页、测试页、结果页、管理页均能静态加载；未配置 Supabase 时给出配置提示，不会白屏。
- 用 mock 的 `get_result` 返回验证过结果页：主城市与匹配度、四组理由、十维对照、雷达图、其他城市、代价、不合拍城市全部渲染；「保存长图」生成 1500×8652 画布并可下载。
- Edge Function 计分与 Python 版对齐：三条测试画像分别得到大理 93%、深圳 88%、洛阳 95%，排序与文案一致。
