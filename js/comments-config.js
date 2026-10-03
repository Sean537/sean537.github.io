/* ==========================================================================
   评论系统配置（唯一需要修改的文件）
   ==========================================================================
   默认使用 Utterances。若你的网络无法访问 utteranc.es → api.github.com
   （国内常见，Utterances 会加载失败、评论区一片空白），有两种解决办法：

   【方案一】修好网络（推荐，改动最小）
     在代理客户端中为下面两个域名添加规则，让它们走正常线路：
       - api.github.com
       - utteranc.es
     Clash 示例：
       rules:
         - DOMAIN,api.github.com,DIRECT
         - DOMAIN,utteranc.es,你的代理节点组
     或临时关闭代理后刷新文章页验证。

   【方案二】改用 Giscus（服务端代理，浏览器不直连 api.github.com）
     1. 打开 https://giscus.app ，用 GitHub 账号登录并授权；
     2. 仓库选择 sean537.github.io，分类任选一个（如 Announcements）；
     3. 页面下方会生成一段配置，复制其中的
        repo / repoId / category / categoryId 四个值；
     4. 粘贴到下方 giscus 对象中，并把 provider 改为 'giscus'。
     注意：Giscus 需要仓库开启 Discussions（giscus.app 会引导你开启）。
   ========================================================================== */

window.SITE_COMMENTS = {
	/* 'utterances' | 'giscus' */
	provider: 'utterances',

	utterances: {
		repo: 'Sean537/sean537.github.io',
		issueTerm: 'pathname' /* pathname | url | title | og:title | Issue 编号 */
	},

	giscus: {
		repo: 'Sean537/sean537.github.io',
		repoId: '',      /* 形如 R_kgDOxxxxxxxx */
		category: 'Announcements',
		categoryId: '',  /* 形如 DIC_kwDOxxxxxxxx */
		mapping: 'pathname',
		strict: '1',
		lang: 'zh-CN',
		limit: '50',
		reactionsEnabled: '1',
		emitMetadata: '0',
		inputPosition: 'top'
	}
};
