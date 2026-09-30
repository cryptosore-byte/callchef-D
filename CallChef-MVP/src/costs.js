export function estimateAI(usage,env=process.env){
 const d=usage.input_token_details||{},cached=d.cached_tokens_details||{};const out=usage.output_token_details||{};
 const entries=[['AI_AUDIO_INPUT_EUR_PER_MILLION',Math.max(0,(d.audio_tokens||0)-(cached.audio_tokens||0))],['AI_AUDIO_CACHED_EUR_PER_MILLION',cached.audio_tokens||0],['AI_TEXT_INPUT_EUR_PER_MILLION',Math.max(0,(d.text_tokens||0)-(cached.text_tokens||0))],['AI_TEXT_CACHED_EUR_PER_MILLION',cached.text_tokens||0],['AI_AUDIO_OUTPUT_EUR_PER_MILLION',out.audio_tokens||0],['AI_TEXT_OUTPUT_EUR_PER_MILLION',out.text_tokens||0]];
 if(!usage.input_token_details||!usage.output_token_details)return null;
 if(entries.some(([key,count])=>count>0&&(!env[key]||!Number.isFinite(Number(env[key]))||Number(env[key])<0)))return null;
 return entries.reduce((sum,[key,count])=>sum+count*Number(env[key]||0)/1e6,0);
}
