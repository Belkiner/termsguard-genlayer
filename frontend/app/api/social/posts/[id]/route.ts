import { normalizeXPost } from "../../../../../lib/x-post";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function redis(command: (string | number)[]) {
  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL!, {
    method:"POST", headers:{Authorization:`Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type":"application/json"},
    body:JSON.stringify(command), cache:"no-store", signal:AbortSignal.timeout(5000), redirect:"error",
  });
  if (!response.ok) throw new Error("Cache unavailable");
  const body = await response.json();
  if (body.error) throw new Error("Cache unavailable");
  return body.result;
}

function reply(body: unknown, status=200) {
  return Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
}

export async function GET(_request: Request, context: {params:Promise<{id:string}>}) {
  const {id} = await context.params;
  if (!/^[1-9][0-9]{0,19}$/.test(id) || BigInt(id)>BigInt("18446744073709551615")) return reply({error:"Invalid post ID."},400);
  const token=process.env.X_BEARER_TOKEN;
  const cap=Number(process.env.X_DAILY_LOOKUP_LIMIT || "0");
  if (!token || !process.env.UPSTASH_REDIS_REST_URL?.startsWith("https://") || !process.env.UPSTASH_REDIS_REST_TOKEN ||
    !Number.isSafeInteger(cap) || cap<1 || cap>10000)
    return reply({error:"X import is not configured. The site operator must enable API access and a daily lookup limit."},503);
  try {
    const cached=await redis(["GET",`termsguard:x:v1:${id}`]);
    if (cached) return reply(JSON.parse(cached));
    // Atomic cap across server instances. Fail closed if the budget store fails.
    // Every attempted upstream lookup counts, including errors; this is a request cap, not a dollar cap.
    const script="local n=tonumber(redis.call('GET',KEYS[1]) or '0'); if n>=tonumber(ARGV[1]) then return 0 end; redis.call('INCR',KEYS[1]); redis.call('EXPIRE',KEYS[1],172800); return 1";
    const granted=await redis(["EVAL",script,1,`termsguard:x:budget:${new Date().toISOString().slice(0,10)}`,cap]);
    if (granted!==1) return reply({error:"The daily X lookup limit has been reached. Try again tomorrow."},429);
    const url=`https://api.x.com/2/tweets/${id}?tweet.fields=author_id,created_at,note_tweet&expansions=author_id&user.fields=username`;
    const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},cache:"no-store",signal:AbortSignal.timeout(10000),redirect:"error"});
    if (!response.ok) return reply({error:response.status===404?"Post not found or no longer public.":"X could not provide this post. Check access, credits or retry later."},response.status===404?404:502);
    const post=normalizeXPost(await response.json(),id);
    await redis(["SET",`termsguard:x:v1:${id}`,JSON.stringify(post),"EX",300]);
    return reply(post);
  } catch {
    // Never expose provider responses, credentials or internal endpoint URLs.
    return reply({error:"The post cannot be retrieved right now. No verified post was returned."},503);
  }
}
