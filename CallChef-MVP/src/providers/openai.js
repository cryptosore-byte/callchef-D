import WebSocket from 'ws';
import {EventEmitter} from 'node:events';
export class OpenAIRealtimeProvider extends EventEmitter {
 constructor({key=process.env.OPENAI_API_KEY,model=process.env.OPENAI_REALTIME_MODEL||'gpt-realtime-2.1',WebSocketImpl=WebSocket}={}){super();this.key=key;this.model=model;this.WS=WebSocketImpl;this.queue=[];this.ready=false;}
 connect({instructions,tools,voice='marin'}){
  this.ws=new this.WS('wss://api.openai.com/v1/realtime?model='+encodeURIComponent(this.model),{headers:{Authorization:'Bearer '+this.key},handshakeTimeout:10000});
  this.ws.on('open',()=>this.send({type:'session.update',session:{type:'realtime',model:this.model,output_modalities:['audio'],instructions,tools,tool_choice:'auto',audio:{input:{format:{type:'audio/pcmu'},transcription:{model:process.env.OPENAI_TRANSCRIBE_MODEL||'gpt-realtime-whisper',language:'fr'},noise_reduction:{type:'near_field'},turn_detection:{type:'server_vad',threshold:0.55,prefix_padding_ms:300,silence_duration_ms:600,interrupt_response:true,create_response:true}},output:{format:{type:'audio/pcmu'},voice}}}}));
  this.ws.on('message',data=>{try{this.handle(JSON.parse(data.toString()));}catch(e){this.emit('failure',new Error('Événement voix invalide'));}});
  this.ws.on('error',()=>this.emit('failure',new Error('Connexion OpenAI impossible')));
  this.ws.on('close',()=>{if(!this.closing)this.emit('failure',new Error('Connexion voix interrompue'));});
 }
 send(data){if(this.ws?.readyState===1)this.ws.send(JSON.stringify(data));}
 handle(e){
  if(e.type==='session.updated'&&!this.ready){this.ready=true;for(const a of this.queue)this.appendAudio(a);this.queue=[];this.emit('ready');}
  if(e.type==='response.created')this.emit('responseStarted');
  if(e.type==='response.output_audio.delta')this.emit('audio',{audio:e.delta,itemId:e.item_id});
  if(e.type==='input_audio_buffer.speech_started')this.emit('speechStarted');
  if(e.type==='conversation.item.input_audio_transcription.completed')this.emit('transcript',{role:'user',text:e.transcript});
  if(e.type==='response.output_audio_transcript.done')this.emit('transcript',{role:'assistant',text:e.transcript});
  if(e.type==='response.function_call_arguments.done')this.emit('tool',{name:e.name,args:e.arguments,id:e.call_id});
  if(e.type==='response.done')this.emit('responseDone',{usage:e.response?.usage,hasTools:e.response?.output?.some(x=>x.type==='function_call'),status:e.response?.status});
  if(e.type==='error'&&!['response_cancel_not_active','conversation_already_has_active_response'].includes(e.error?.code))this.emit('failure',new Error(e.error?.code||'Erreur OpenAI'));
 }
 appendAudio(audio){if(!this.ready){if(this.queue.length<250)this.queue.push(audio);return;}this.send({type:'input_audio_buffer.append',audio});}
 toolResult(callId,output){this.send({type:'conversation.item.create',item:{type:'function_call_output',call_id:callId,output:JSON.stringify(output)}});}
 respond(instructions){this.send({type:'response.create',response:instructions?{instructions}:undefined});}
 truncate(itemId,audioEndMs){if(itemId)this.send({type:'conversation.item.truncate',item_id:itemId,content_index:0,audio_end_ms:Math.max(0,Math.floor(audioEndMs))});}
 close(){this.closing=true;this.ws?.close();}
}
