export async function triggerGithubAction(env, job) {
  const { chatId, email, cookieText, workspaceId, telegramId } = job;
  
  console.log(`[GH ACTIONS] Mengirim job untuk user ${telegramId} ke workspace ${workspaceId}`);
  
  const owner = env.GITHUB_REPO_OWNER;
  const repo = env.GITHUB_REPO_NAME;
  const token = env.GITHUB_TOKEN;
  
  if (!owner || !repo || !token) {
    console.error("Github Actions config tidak lengkap!");
    return false;
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/invite.yml/dispatches`, {
      method: "POST",
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "Telekuy-Cloudflare-Worker"
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          cookie: cookieText,
          email: email,
          user_id: telegramId.toString(),
          workspace_id: workspaceId,
          chat_id: chatId.toString()
        }
      })
    });
    
    if (res.status === 204) {
      console.log("✅ Github Action berhasil di-trigger!");
      return { success: true };
    } else {
      const errorText = await res.text();
      console.error(`❌ Gagal trigger Github Action: ${res.status}`, errorText);
      return { success: false, error: `HTTP ${res.status}: ${errorText.substring(0, 50)}` };
    }
  } catch (error) {
    console.error("❌ Exception trigger Github Action:", error.message);
    return { success: false, error: error.message };
  }
}
