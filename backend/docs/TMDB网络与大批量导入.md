# TMDB 网络与大批量导入（200+ 部）

## 为何只有十几部？

**默认**仅从 **TMDB** 拉片（`TMDB_API_KEY`）。若本机访问 `api.themoviedb.org` 失败，接口会**报错**，不再偷偷改走猫眼。  
只有你在 `.env` 里设置 **`TMDB_MAOYAN_FALLBACK=1`** 时，才会在 TMDB 列表失败时降级猫眼（片单很短，可能只有约 **12 部**，且 `_id` 形如 `tmdb_maoyan_*`）。

## 推荐做法

1. **开系统代理 / Clash**  
   - 打开「允许局域网连接」，记下本机 HTTP 端口（常见 **7890**、**7897**）。

2. **在 `backend/.env` 增加**（择一即可）  
   ```env
   HTTPS_PROXY=http://127.0.0.1:7890
   ```
   或  
   ```env
   HTTP_PROXY=http://127.0.0.1:7890
   ```

3. **可选：拉长超时与重试**  
   ```env
   TMDB_REQUEST_TIMEOUT_MS=28000
   TMDB_REQUEST_MAX_ATTEMPTS=8
   TMDB_REQUEST_RETRY_DELAY_MS=1000
   ```

4. **不要猫眼兜底（默认已是）**  
   勿设置 `TMDB_MAOYAN_FALLBACK`，或设 `TMDB_NO_MAOYAN_FALLBACK=1`；脚本可加 `--tmdb-only` 以清除可能遗留的猫眼环境变量。

5. **重新跑大批量导入**  
   ```bash
   cd backend
   node scripts/wipeMoviesAndReimportTmdb.js
   ```  
   脚本会：多榜单 → discover 未来档期 → discover 全库热度，目标 **200+** 条（去重后以数据库实际行数为准）。

## 验证 TMDB 是否可访问

在配置好代理的同一终端里：

```bash
curl -sI "https://api.themoviedb.org/3/movie/550?api_key=你的KEY"
```

应返回 `HTTP/2 200`（或 401 若 key 拼错，但说明网络已通）。
