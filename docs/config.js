// 部署前只需改这一个文件。
// SUPABASE_URL / SUPABASE_ANON_KEY 在 Supabase Dashboard → Project Settings → API 里复制。
// 前端只放公开可发布的 key（旧版 anon JWT 或新版 sb_publishable_ 都可以）；
// service_role / sb_secret_ 绝不能出现在这里或任何前端文件中。
window.CF_CONFIG = {
  SUPABASE_URL: "https://wdnnmhmbdnxqbcwrerzi.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_neHOUsDKc0zq5JN5RZc7JA_vqs87Zae",
  SUBMIT_FUNCTION: "submit"
};
