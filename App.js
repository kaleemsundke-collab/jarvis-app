import React, { useEffect, useRef, useState } from 'react';
import { Linking, PermissionsAndroid, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import * as Speech from 'expo-speech';
import { useKeepAwake } from 'expo-keep-awake';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import Native from './modules/jarvis-native';

const HOME = 'https://jarvis-kaleem.vercel.app';

// Friendly name -> Android package. Opened with a launcher intent, no tap needed.
const APPS = {
  whatsapp: 'com.whatsapp', youtube: 'com.google.android.youtube', chrome: 'com.android.chrome',
  gmail: 'com.google.android.gm', maps: 'com.google.android.apps.maps', camera: 'com.android.camera',
  instagram: 'com.instagram.android', spotify: 'com.spotify.music', telegram: 'org.telegram.messenger',
  facebook: 'com.facebook.katana', photos: 'com.google.android.apps.photos', calendar: 'com.google.android.calendar',
  clock: 'com.google.android.deskclock', calculator: 'com.google.android.calculator', settings: 'com.android.settings',
  playstore: 'com.android.vending', 'play store': 'com.android.vending', phonepe: 'com.phonepe.app',
  'google pay': 'com.google.android.apps.nbu.paisa.user', paytm: 'net.one97.paytm', drive: 'com.google.android.apps.docs',
  twitter: 'com.twitter.android', x: 'com.twitter.android', snapchat: 'com.snapchat.android', netflix: 'com.netflix.mediaclient',
};

function launch(pkg) {
  return Linking.openURL('intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=' + pkg + ';end');
}

const WAKE = /\b(jarvis|jarvish|jervis|travis|service)\b/i;
const say = (t) => Speech.speak(t, { language: 'en-GB', pitch: 0.8, rate: 0.95 });
const NUMWORDS = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', oh: '0' };
const digits = (str) => str.toLowerCase().split(/\s+/).map((w) => (NUMWORDS[w] !== undefined ? NUMWORDS[w] : w)).join('');
let pendingSms = null; // { number, text } waiting for the spoken word "send"

const NEED_A11Y = 'Please switch Jarvis on in Accessibility settings, sir. I am opening them now.';
function phone(kind, arg) {
  if (!Native) return 'My native controls are not available in this build, sir.';
  if (!Native.accessibilityEnabled()) { try { Native.openAccessibilitySettings(); } catch (e) { /* ignore */ } return NEED_A11Y; }
  const r = Native.phoneAction(kind, arg || '');
  if (r === 'ok') return 'Done, sir.';
  if (r === 'not-found') return 'I cannot see "' + arg + '" on the screen, sir.';
  if (r === 'nothing-to-scroll') return 'There is nothing to scroll here, sir.';
  if (r === 'no-field') return 'No text field is selected, sir.';
  return 'That did not work, sir.';
}

// Handles commands that only the native app can do. Returns a spoken reply, or null to let the web Jarvis answer.
async function nativeCommand(raw) {
  const t = raw.toLowerCase().replace(/^(?:hey |ok |okay )?jarvis[,.:!?]?\s*/, '').replace(/[.!?]+$/, '').trim();
  let m;
  if (pendingSms) {
    if (/^(send|yes|confirm|go ahead|send it)$/.test(t)) {
      const p = pendingSms; pendingSms = null;
      if (!Native) return 'My native controls are not available, sir.';
      const r = Native.sendSms(p.number, p.text);
      return r === 'ok' ? 'Sent, sir.' : r === 'permission' ? 'I need the SMS permission, sir. Please allow it and ask again.' : 'The message could not be sent, sir.';
    }
    if (/^(cancel|no|stop|don.?t send)/.test(t)) { pendingSms = null; return 'Cancelled, sir.'; }
  }
  if (/^(answer|pick up|accept)( the)?( call| phone)?$/.test(t)) {
    if (!Native) return 'My native controls are not available, sir.';
    const r = Native.answerCall();
    return r === 'ok' ? 'Answered, sir.' : r === 'permission' ? 'I need the phone permission, sir.' : 'I could not answer that, sir.';
  }
  if (/^(reject|decline|hang up|end|cut)( the)?( call| phone)?$/.test(t)) {
    if (!Native) return 'My native controls are not available, sir.';
    const r = Native.endCall();
    return r === 'ok' ? 'Call ended, sir.' : r === 'permission' ? 'I need the phone permission, sir.' : 'I could not end that, sir.';
  }
  m = /^(?:text|sms|message|send (?:a )?(?:text|sms|message) to)\s+((?:\+?[\d]|zero|one|two|three|four|five|six|seven|eight|nine|oh)[\w\s+-]{4,30}?)\s+(?:saying|say|that says|message|:)\s+(.+)$/.exec(t);
  if (m) {
    const number = digits(m[1]).replace(/[^\d+]/g, '');
    if (number.length >= 8) { pendingSms = { number, text: m[2] }; return 'I will text ' + number.split('').join(' ') + ': ' + m[2] + '. Say send to confirm, or cancel.'; }
  }
  if (/^(go )?back$/.test(t)) return phone('back');
  if (/^(go )?home$|^home screen$/.test(t)) return phone('home');
  if (/^(recent apps|recents|app switcher)$/.test(t)) return phone('recents');
  if (/^(show |open |pull down )?(notifications|notification shade)$/.test(t)) return phone('notifications');
  if (/^scroll down$|^swipe up$/.test(t)) return phone('scroll_down');
  if (/^scroll up$|^swipe down$/.test(t)) return phone('scroll_up');
  m = /^(?:tap|click|press|select)(?: on)?\s+(.+)$/.exec(t);
  if (m) return phone('tap_text', m[1]);
  m = /^type\s+(.+)$/.exec(t);
  if (m) return phone('type', m[1]);
  m = /^(?:please )?(?:open|launch|start)\s+(.+)$/.exec(t);
  if (m) {
    const name = m[1].replace(/^the\s+/, '').replace(/\s+app$/, '').trim();
    const pkg = APPS[name];
    if (pkg) { try { await launch(pkg); return 'Opening ' + name + ', sir.'; } catch (e) { return 'I could not open ' + name + ', sir. It may not be installed.'; } }
    return null;
  }
  m = /^(?:call|dial|phone)\s+(\+?[\d\s-]{6,16})$/.exec(t);
  if (m) { Linking.openURL('tel:' + m[1].replace(/[\s-]/g, '')); return 'Dialling, sir.'; }
  m = /^(?:navigate|directions|take me) to\s+(.+)$/.exec(t);
  if (m) { Linking.openURL('geo:0,0?q=' + encodeURIComponent(m[1])); return 'Navigating to ' + m[1] + ', sir.'; }
  m = /^whatsapp\s+(\+?\d{8,15})\s+(.+)$/.exec(t);
  if (m) { Linking.openURL('https://wa.me/' + m[1].replace('+', '') + '?text=' + encodeURIComponent(m[2])); return 'Message prepared in WhatsApp, sir. Tap send.'; }
  return null;
}

// Android WebView has no SpeechRecognition, so the Jarvis website's microphone never worked in the app.
// This shim, injected before the page loads, provides it and forwards to the phone's native recogniser.
const SHIM = `(function(){
  if (window.__nativeSR) return; window.__nativeSR = true;
  var live = {}, cnt = 0, cur = null;
  function post(o){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(o)); }catch(e){} }
  function SR(){ this.lang='en-IN'; this.continuous=false; this.interimResults=false; this.maxAlternatives=1; this._id=++cnt; live[this._id]=this; }
  SR.prototype.start=function(){ post({t:'start',id:this._id,lang:this.lang,continuous:!!this.continuous}); };
  SR.prototype.stop=function(){ post({t:'stop',id:this._id}); };
  SR.prototype.abort=function(){ post({t:'abort',id:this._id}); };
  SR.prototype.addEventListener=function(n,f){ this['on'+n]=f; };
  SR.prototype.removeEventListener=function(){};
  window.SpeechRecognition = window.webkitSpeechRecognition = SR;
  window.__sre = function(id, type, d){
    var r = live[id]; if(!r) return;
    var h = r['on'+type]; if(typeof h!=='function') return;
    if (type==='result'){
      var alt = [{transcript:d.text, confidence:1}]; alt.isFinal = !!d.final;
      h.call(r, {resultIndex:0, results:[alt]});
    } else if (type==='error'){ h.call(r, {error:d.error}); }
    else { h.call(r, {}); }
  };
})();true;`;

// Types a command into the website chat and presses send (used when the wake word hears a non-native command).
const injectChat = (text) => `(function(){try{
  var t=${JSON.stringify(text)};
  var el=document.querySelector('textarea')||document.querySelector('input[type=text]');
  if(!el){return;}
  var proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(el,t);
  el.dispatchEvent(new Event('input',{bubbles:true}));
  var b=document.querySelector('[data-act="send"]')||document.querySelector('button[type=submit]');
  if(b){b.click();}else{el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true}));}
}catch(e){}})();true;`;

export default function App() {
  useKeepAwake();
  const web = useRef(null);
  const curId = useRef(null);
  const mode = useRef('idle'); // 'idle' | 'web' | 'wake'
  const wakeOn = useRef(false);
  const lastFinal = useRef('');
  const awaiting = useRef(false);
  const [wake, setWake] = useState(false);
  const [status, setStatus] = useState('');

  const send = (type, data) => {
    if (!web.current || curId.current == null) return;
    web.current.injectJavaScript('window.__sre&&window.__sre(' + curId.current + ',' + JSON.stringify(type) + ',' + JSON.stringify(data || {}) + ');true;');
  };

  const beginWake = () => {
    if (!wakeOn.current) return;
    mode.current = 'wake';
    try { ExpoSpeechRecognitionModule.start({ lang: 'en-IN', interimResults: true, continuous: true, maxAlternatives: 1, contextualStrings: ['Jarvis'] }); }
    catch (e) { setStatus('Speech error: ' + (e && e.message ? e.message : 'unknown')); }
  };

  useSpeechRecognitionEvent('start', () => { if (mode.current === 'web') send('start'); });
  useSpeechRecognitionEvent('result', async (e) => {
    const text = (e.results && e.results[0] && e.results[0].transcript) || '';
    if (!text) return;
    if (mode.current === 'web') {
      if (e.isFinal) {
        const reply = await nativeCommand(text);
        if (reply) { setStatus('Heard: ' + text); say(reply); send('end'); mode.current = 'idle'; try { ExpoSpeechRecognitionModule.abort(); } catch (x) { /* ignore */ } return; }
      }
      send('result', { text, final: !!e.isFinal });
      return;
    }
    if (mode.current !== 'wake' || !e.isFinal || text === lastFinal.current) return;
    lastFinal.current = text;
    const w = WAKE.exec(text);
    let cmd = '';
    if (w) cmd = text.slice(w.index + w[0].length).replace(/^[\s,.:!-]+/, '');
    else if (awaiting.current || pendingSms) cmd = text;
    else return;
    if (!cmd) { awaiting.current = true; setStatus('Yes, sir?'); say('Yes, sir?'); return; }
    awaiting.current = false;
    setStatus('Heard: ' + cmd);
    const reply = await nativeCommand(cmd);
    if (reply) say(reply);
    else if (web.current) web.current.injectJavaScript(injectChat(cmd));
  });
  useSpeechRecognitionEvent('error', (e) => {
    if (mode.current === 'web') { send('error', { error: e.error || 'unknown' }); return; }
    if (e.error === 'not-allowed') { wakeOn.current = false; setWake(false); setStatus('Microphone permission denied'); }
  });
  useSpeechRecognitionEvent('end', () => {
    if (mode.current === 'web') { send('end'); mode.current = 'idle'; }
    if (wakeOn.current) setTimeout(beginWake, 700);
  });

  const onMessage = async (ev) => {
    let m; try { m = JSON.parse(ev.nativeEvent.data); } catch (e) { return; }
    if (m.t === 'start') {
      curId.current = m.id;
      try {
        const p = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!p.granted) { send('error', { error: 'not-allowed' }); send('end'); setStatus('Microphone permission denied'); return; }
        try { ExpoSpeechRecognitionModule.abort(); } catch (e) { /* ignore */ }
        mode.current = 'web';
        setTimeout(() => {
          try { ExpoSpeechRecognitionModule.start({ lang: m.lang || 'en-IN', interimResults: true, continuous: !!m.continuous, maxAlternatives: 1, contextualStrings: ['Jarvis'] }); }
          catch (e) { mode.current = 'idle'; send('error', { error: 'audio-capture' }); send('end'); }
        }, 350);
      } catch (e) { send('error', { error: 'audio-capture' }); send('end'); setStatus('Speech error: ' + (e && e.message ? e.message : 'unknown')); }
    } else if (m.t === 'stop') { try { ExpoSpeechRecognitionModule.stop(); } catch (e) { /* ignore */ } }
    else if (m.t === 'abort') { try { ExpoSpeechRecognitionModule.abort(); } catch (e) { /* ignore */ } }
  };

  const toggleWake = async () => {
    if (wakeOn.current) {
      wakeOn.current = false; setWake(false); setStatus('Wake word off'); mode.current = 'idle';
      try { ExpoSpeechRecognitionModule.abort(); } catch (e) { /* ignore */ }
      try { Native && Native.stopListenService(); } catch (e) { /* ignore */ }
      return;
    }
    const p = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!p.granted) { setStatus('Microphone permission needed'); return; }
    wakeOn.current = true; setWake(true); setStatus('Listening for "Jarvis"...');
    try { Native && Native.startListenService(); } catch (e) { /* ignore */ }
    beginWake();
  };

  useEffect(() => {
    if (Platform.OS === 'android') {
      const P = PermissionsAndroid.PERMISSIONS;
      PermissionsAndroid.requestMultiple([P.CAMERA, P.RECORD_AUDIO, P.ACCESS_FINE_LOCATION, P.ANSWER_PHONE_CALLS, P.READ_PHONE_STATE, P.SEND_SMS, P.POST_NOTIFICATIONS].filter(Boolean)).catch(() => {});
    }
  }, []);

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <WebView
        ref={web}
        source={{ uri: HOME }}
        style={s.web}
        injectedJavaScriptBeforeContentLoaded={SHIM}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        geolocationEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grant"
        setSupportMultipleWindows={false}
        originWhitelist={['https://*', 'http://*', 'tel:*', 'mailto:*', 'intent:*', 'whatsapp:*', 'sms:*']}
        onShouldStartLoadWithRequest={(r) => {
          if (/^(tel:|sms:|mailto:|whatsapp:|intent:)/.test(r.url) || /^https:\/\/(wa\.me|api\.whatsapp\.com)/.test(r.url)) { Linking.openURL(r.url).catch(() => {}); return false; }
          return true;
        }}
      />
      <TouchableOpacity style={[s.btn, wake && s.on]} onPress={toggleWake}>
        <Text style={s.t}>{wake ? 'Wake word ON' : 'Wake word'}</Text>
      </TouchableOpacity>
      {status ? <Text style={s.st}>{status}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#02121c', paddingTop: 28 },
  web: { flex: 1, backgroundColor: '#02121c' },
  btn: { position: 'absolute', left: 12, top: 40, backgroundColor: 'rgba(6,20,29,.92)', borderColor: '#1fd6ff', borderWidth: 1, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, zIndex: 10 },
  on: { backgroundColor: '#1fd6ff' },
  t: { color: '#dff8ff', fontWeight: '600' },
  st: { position: 'absolute', left: 12, bottom: 12, color: '#9fe9ff', fontSize: 12, backgroundColor: 'rgba(6,20,29,.9)', padding: 6, borderRadius: 8, maxWidth: 260 },
});
