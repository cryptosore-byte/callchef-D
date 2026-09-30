/** Provider boundary: the domain never imports Twilio or OpenAI.
 * VoiceEngine: connect({instructions,tools,voice}); appendAudio(base64PCMU);
 * toolResult(callId,object); respond(); truncate(itemId,audioEndMs); close();
 * emits ready, audio {audio,itemId}, speechStarted, transcript {role,text},
 * tool {name,args,id}, responseDone {usage}, failure.
 * TelephonyProvider: verifyWebhook(req), streamTwiml(callId,token),
 * transfer(providerCallId,configuredNumber), finish(providerCallId).
 * Other providers must implement and pass the same contract tests before selection.
 * No fake Fish/Telnyx implementations are advertised as usable.
 */
export {};
