import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, PermissionsAndroid, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import * as Speech from 'expo-speech';
import { useKeepAwake } from 'expo-keep-awake';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

const HOME = 'https://jarvis-kaleem.vercel.app';
const WAKE = /\b(jarvis|jarvish|service|travis|jervis)\b/i;

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

// Returns a spoken reply if it handled the command natively, otherwise null (-> hand to the web Jarvis brain).
async function nativeCommand(text) {
  const t = text.toLowerCase().trim();
  let m = /^(?:please )?(?:open|launch|start)\s+(.+)$/.exec(t);
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
  m = /^(?:play|search youtube for)\s+(.+?)(?: on youtube)?$/.exec(t);
  if (m) { Linking.openURL('https://www.youtube.com/results?search_query=' + encodeURIComponent(m[1])); return 'Searching YouTube, sir.'; }
  m = /^(?:search|google)\s+(?:for\s+)?(.+)$/.exec(t);
  if (m) { Linking.openURL('https://www.google.com/search?q=' + encodeURIComponent(m[1])); return 'Searching, sir.'; }
  m = /^whatsapp\s+(\+?\d{8,15})\s+(.+)$/.exec(t);
  if (m) { Linking.openURL('https://wa.me/' + m[1].replace('+', '') + '?text=' + encodeURIComponent(m[2])); return 'Message prepared in WhatsApp, sir. Tap send.'; }
  return null;
}

// Types the command into the web Jarvis chat and presses send.
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
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState('Wake word off');
  const wantOn = useRef(false);
  const awaiting = useRef(false);
  const lastFinal = useRef('');

  const begin = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.start({ lang: 'en-IN', interimResults: true, continuous: true, maxAlternatives: 1, contextualStrings: ['Jarvis'] });
    } catch (e) { setStatus('Speech error: ' + (e && e.message ? e.message : 'unknown')); }
  }, []);

  useSpeechRecognitionEvent('end', () => {
    if (wantOn.current) setTimeout(begin, 400);
  });
  useSpeechRecognitionEvent('error', (e) => {
    if (e.error === 'not-allowed') { wantOn.current = false; setListening(false); setStatus('Microphone permission denied'); return; }
    if (wantOn.current) setTimeout(begin, 1200);
  });
  useSpeechRecognitionEvent('result', async (e) => {
    const text = (e.results && e.results[0] && e.results[0].transcript) || '';
    if (!e.isFinal || !text || text === lastFinal.current) return;
    lastFinal.current = text;
    const wake = WAKE.exec(text);
    let cmd = '';
    if (wake) { cmd = text.slice(wake.index + wake[0].length).replace(/^[\s,.:!-]+/, ''); }
    else if (awaiting.current) { cmd = text; }
    else return;
    if (!cmd) { awaiting.current = true; setStatus('Yes, sir?'); Speech.speak('Yes, sir?', { language: 'en-GB', pitch: 0.8 }); return; }
    awaiting.current = false;
    setStatus('Heard: ' + cmd);
    const reply = await nativeCommand(cmd);
    if (reply) { Speech.speak(reply, { language: 'en-GB', pitch: 0.8 }); }
    else if (web.current) { web.current.injectJavaScript(injectChat(cmd)); }
  });

  const toggle = async () => {
    if (listening) {
      wantOn.current = false; setListening(false); setStatus('Wake word off');
      try { ExpoSpeechRecognitionModule.stop(); } catch (e) { /* ignore */ }
      return;
    }
    const p = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!p.granted) { setStatus('Microphone permission needed'); return; }
    wantOn.current = true; setListening(true); setStatus('Listening for "Jarvis"...'); begin();
  };

  useEffect(() => {
    if (Platform.OS === 'android') {
      PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.CAMERA, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]).catch(() => {});
    }
  }, []);

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <WebView
        ref={web}
        source={{ uri: HOME }}
        style={s.web}
        javaScriptEnabled
        domStorageEnabled
        geolocationEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grant"
        setSupportMultipleWindows={false}
        originWhitelist={['https://*', 'http://*', 'tel:*', 'mailto:*', 'intent:*', 'whatsapp:*', 'sms:*']}
        onShouldStartLoadWithRequest={(r) => {
          if (/^https?:\/\/(jarvis-kaleem\.vercel\.app|[^/]*\.(googleapis|open-meteo|openrouter)\.[a-z]+)/.test(r.url) || r.url === 'about:blank') return true;
          if (/^(tel:|sms:|mailto:|whatsapp:|intent:)/.test(r.url) || /^https:\/\/(wa\.me|api\.whatsapp\.com)/.test(r.url)) { Linking.openURL(r.url).catch(() => {}); return false; }
          return true;
        }}
      />
      <TouchableOpacity style={[s.btn, listening && s.on]} onPress={toggle}>
        <Text style={s.t}>{listening ? 'Wake word ON' : 'Wake word'}</Text>
      </TouchableOpacity>
      <Text style={s.st}>{status}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#02121c', paddingTop: 28 },
  web: { flex: 1, backgroundColor: '#02121c' },
  btn: { position: 'absolute', left: 12, top: 40, backgroundColor: 'rgba(6,20,29,.92)', borderColor: '#1fd6ff', borderWidth: 1, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, zIndex: 10 },
  on: { backgroundColor: '#1fd6ff' },
  t: { color: '#dff8ff', fontWeight: '600' },
  st: { position: 'absolute', left: 12, top: 84, color: '#9fe9ff', fontSize: 12, zIndex: 10, maxWidth: 240 },
});
