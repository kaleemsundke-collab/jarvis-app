import React, { useEffect, useRef, useState } from 'react';
import { Linking, PermissionsAndroid, Platform, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import * as Speech from 'expo-speech';
import { useKeepAwake } from 'expo-keep-awake';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

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

// Handles commands that only the native app can do. Returns a spoken reply, or null to let the web Jarvis answer.
async function nativeCommand(raw) {
  const t = raw.toLowerCase().replace(/^(?:hey |ok |okay )?jarvis[,.:!?]?\s*/, '').trim();
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

export default function App() {
  useKeepAwake();
  const web = useRef(null);
  const curId = useRef(null);
  const handled = useRef(false);
  const [status, setStatus] = useState('');

  const send = (type, data) => {
    if (!web.current || curId.current == null) return;
    web.current.injectJavaScript('window.__sre&&window.__sre(' + curId.current + ',' + JSON.stringify(type) + ',' + JSON.stringify(data || {}) + ');true;');
  };

  useSpeechRecognitionEvent('start', () => send('start'));
  useSpeechRecognitionEvent('result', async (e) => {
    const text = (e.results && e.results[0] && e.results[0].transcript) || '';
    if (!text) return;
    if (e.isFinal && !handled.current) {
      const reply = await nativeCommand(text);
      if (reply) {
        handled.current = true;
        setStatus('Heard: ' + text);
        Speech.speak(reply, { language: 'en-GB', pitch: 0.8 });
        return;
      }
    }
    if (!handled.current) send('result', { text, final: !!e.isFinal });
  });
  useSpeechRecognitionEvent('error', (e) => { send('error', { error: e.error || 'unknown' }); });
  useSpeechRecognitionEvent('end', () => { send('end'); handled.current = false; });

  const onMessage = async (ev) => {
    let m; try { m = JSON.parse(ev.nativeEvent.data); } catch (e) { return; }
    if (m.t === 'start') {
      curId.current = m.id; handled.current = false;
      try {
        const p = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!p.granted) { send('error', { error: 'not-allowed' }); send('end'); setStatus('Microphone permission denied'); return; }
        ExpoSpeechRecognitionModule.start({ lang: m.lang || 'en-IN', interimResults: true, continuous: !!m.continuous, maxAlternatives: 1, contextualStrings: ['Jarvis'] });
      } catch (e) { send('error', { error: 'audio-capture' }); send('end'); setStatus('Speech error: ' + (e && e.message ? e.message : 'unknown')); }
    } else if (m.t === 'stop') { try { ExpoSpeechRecognitionModule.stop(); } catch (e) { /* ignore */ } }
    else if (m.t === 'abort') { try { ExpoSpeechRecognitionModule.abort(); } catch (e) { /* ignore */ } }
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
      {status ? <Text style={s.st}>{status}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#02121c', paddingTop: 28 },
  web: { flex: 1, backgroundColor: '#02121c' },
  st: { position: 'absolute', left: 12, bottom: 12, color: '#9fe9ff', fontSize: 12, backgroundColor: 'rgba(6,20,29,.9)', padding: 6, borderRadius: 8 },
});
