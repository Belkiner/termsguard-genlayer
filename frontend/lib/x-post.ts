export function postId(input: string): string {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error("Paste a public X post URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
    !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname))
    throw new Error("Use an HTTPS x.com or twitter.com post URL.");
  const match = url.pathname.match(/^\/(?:[A-Za-z0-9_]{1,15}|i\/web)\/status\/([1-9][0-9]{0,19})\/?$/);
  if (!match || BigInt(match[1]) > BigInt("18446744073709551615")) throw new Error("Use a link to one post, not a profile or search page.");
  return match[1];
}

export type XPost = {id:string; author_id:string; username:string; text:string; created_at:string; url:string};

export function normalizeXPost(raw: any, expectedId: string): XPost {
  const p = raw?.data;
  const author = Array.isArray(raw?.includes?.users) ? raw.includes.users.find((u:any) => u?.id === p?.author_id) : undefined;
  const text = p?.note_tweet?.text ?? p?.text;
  if (p?.id !== expectedId || typeof p.author_id !== "string" || !/^[0-9]+$/.test(p.author_id) ||
    !author || typeof author.username !== "string" || !/^[A-Za-z0-9_]{1,15}$/.test(author.username) ||
    typeof text !== "string" || !text.trim() || text.length > 10000 ||
    typeof p.created_at !== "string" || !Number.isFinite(Date.parse(p.created_at)))
    throw new Error("The post is unavailable or its text cannot be verified.");
  // Quoted posts, attached media and linked pages are not part of this text-only import.
  return {id:p.id, author_id:p.author_id, username:author.username, text:text.trim(),
    created_at:p.created_at, url:`https://x.com/${author.username}/status/${p.id}`};
}
