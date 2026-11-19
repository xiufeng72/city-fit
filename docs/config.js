// 部署前只需改这一个文件。
// SUPABASE_URL / SUPABASE_ANON_KEY 在 Supabase Dashboard → Project Settings → API 里复制。
// 只放 anon public key；service_role 绝不能出现在这里或任何前端文件中。
window.CF_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  SUBMIT_FUNCTION: "submit"
};
