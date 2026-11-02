export type DataMode = 'demo' | 'live';
const key = 'bikepulse:mode:u';
export function getMode():DataMode {try{return localStorage.getItem(key)==='live'?'live':'demo';}catch{return 'demo';}}
export function changeMode(next:DataMode):void {localStorage.setItem(key,next);window.location.reload();}
export const isDemo = () => getMode()==='demo';
