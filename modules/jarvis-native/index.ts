import { requireNativeModule } from 'expo-modules-core';

type Native = {
  startListenService(): boolean;
  stopListenService(): boolean;
  answerCall(): string;
  endCall(): string;
  sendSms(number: string, text: string): string;
  accessibilityEnabled(): boolean;
  openAccessibilitySettings(): boolean;
  phoneAction(kind: string, arg: string): string;
  notificationAccessEnabled(): boolean;
  openNotificationSettings(): boolean;
  startCall(number: string): string;
  muteBeep(muted: boolean): boolean;
  lastCallType(number: string): number;
  alertMe(title: string, text: string): boolean;
  canReply(name: string): string;
  replyTo(name: string, text: string): string;
  scheduleAlert(id: number, whenMs: number, title: string, text: string): boolean;
  torch(on: boolean): boolean;
  volume(mode: string, level: number): number;
  findPhone(on: boolean): boolean;
  openPanel(name: string): boolean;
  addListener(name: string, cb: (e: any) => void): { remove(): void };
};

let mod: Native | null = null;
try { mod = requireNativeModule('JarvisNative'); } catch (e) { mod = null; }
export default mod;
