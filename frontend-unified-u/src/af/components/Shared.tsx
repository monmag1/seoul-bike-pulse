import type { ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { changeMode, getMode } from '../mode';
import { Activity, ArrowDownRight, ArrowUpRight, Bell, Bike, Box, CalendarClock, ChevronDown, CircleHelp, CloudSun, Command, Database, Gauge, GitBranch, LayoutDashboard, LogOut, Menu, Radio, Search, Settings2, ShieldCheck, Sparkles, Waves } from 'lucide-react';

const nav = [
  { to:'/dashboard', title:'Overview', no:'01', Icon:LayoutDashboard, detail:'Overview Dashboard' },
  { to:'/predict', title:'Predictor', no:'02', Icon:CloudSun, detail:'Bike Demand Predictor' },
  { to:'/historical', title:'Historical Data', no:'03', Icon:Database, detail:'Data Explorer' },
  { to:'/mlops', title:'MLOps Control', no:'04', Icon:GitBranch, detail:'Pipeline & Models' },
  { to:'/operations', title:'Operations', no:'05', Icon:Activity, detail:'Service Monitoring' },
];
const titles:Record<string,string>={'/dashboard':'Overview Dashboard','/predict':'Bike Demand Predictor','/historical':'Historical Data Explorer','/mlops':'MLOps Control Center','/operations':'Operations Monitoring'};
export const fmtNum=(x:number)=>new Intl.NumberFormat('ko-KR').format(Math.round(x));
export const clock=(time:string)=> time ? time.slice(11,16) : '—';
export function Shell(){
  const location=useLocation();const demo=getMode()==='demo';
  return <div className="af-shell">
    <aside className="af-sidebar">
      <div className="af-brand"><div className="af-logo"><Bike size={23} strokeWidth={2.5}/></div><div><strong>BIKE<span>PULSE</span></strong><small>SEOUL DEMAND INTELLIGENCE</small></div></div>
      <div className="af-workspace"><div className="af-workspace-glyph"><Waves size={17}/></div><div><b>Seoul Metropolitan</b><small>Mobility analytics workspace</small></div><ChevronDown size={14}/></div>
      <div className="af-nav-caption">WORKSPACE <span>MAIN</span></div>
      <nav aria-label="화면 A부터 E까지 메뉴">{nav.map(({to,title,Icon,no})=><NavLink key={to} to={to} className={({isActive})=>`af-nav-item ${isActive?'is-active':''}`}><Icon size={18} strokeWidth={1.8}/><b>{title}</b><span className="af-nav-number">{no}</span></NavLink>)}</nav>
      <div className="af-nav-caption af-nav-second">SYSTEM <span>TOOLS</span></div>
      <div className="af-utility"><span><Settings2 size={16}/> Settings <small>STAGING</small></span><span><CircleHelp size={16}/> API Reference</span></div>
      <div className="af-sidebar-fill"/>
      <div className="af-side-module"><div className="af-side-module-head"><span className="af-live-dot"/> MODEL STATUS <ArrowUpRight size={14}/></div><div className="af-side-version">mv001 <span>STAGING</span></div><div className="af-mini-progress"><span style={{width:'84%'}}/></div><small>{demo?'시연 데이터 · 모델 응답 아님':'실제 API와 상태 동기화'}</small></div>
      <div className="af-profile"><span className="af-avatar">BP</span><div><b>BikePulse Lab</b><small>Education workspace</small></div><LogOut size={15}/></div>
    </aside>
    <div className="af-main">
      <header className="af-topbar"><div className="af-breadcrumb"><span>Workspace</span><span className="af-crumb-divider">/</span><b>{titles[location.pathname]||'Dashboard'}</b></div><div className="af-top-actions"><div className="af-search"><Search size={15}/><span>Search analytics...</span><kbd>⌘ K</kbd></div><span className="af-region"><span className="af-live-dot"/> AP-NORTHEAST-2</span><button className="af-icon-btn" type="button" aria-label="알림 (시연)" title="알림은 화면 구성 요소입니다"><Bell size={17}/></button><button className="af-mode-button" type="button" onClick={()=>changeMode(demo?'live':'demo')}><Radio size={14}/>{demo?'DEMO MODE':'LIVE AWS'}<ChevronDown size={13}/></button><span className="af-avatar af-avatar-top">BP</span></div></header>
      <main className="af-content"><div className="af-ambient af-ambient-a"/><div className="af-ambient af-ambient-b"/>{demo&&<div className="af-demo-banner"><Sparkles size={16}/><strong>INTERACTIVE SHOWCASE</strong><span>모든 시각화 수치는 시연용입니다. AWS 실측 및 mv001 예측이 아닙니다.</span><button type="button" onClick={()=>changeMode('live')}>AWS 데이터 보기 <ArrowUpRight size={13}/></button></div>}<Outlet/></main>
      <footer className="af-footer"><span><span className="af-live-dot"/> SEOUL BIKE PULSE · UNIFIED OPERATIONS</span><span>Historical dataset: 2017–2018 · {demo?'DEMONSTRATION':'AWS LIVE CONNECTION'}</span></footer>
    </div>
  </div>
}
export function PageHead({kicker,title,description}: {kicker:string;title:string;description:string}) {return <div className="af-page-head"><div><span className="af-eyebrow"><span className="af-line-dot"/>{kicker}</span><h1>{title}<span className="af-title-spark"> ✦</span></h1><p>{description}</p></div><div className="af-page-head-actions"><span className="af-period"><CalendarClock size={15}/> Historical data</span><span className="af-accent-tag"><Sparkles size={13}/> INTELLIGENCE</span></div></div>}
export function Panel({title,subtitle,children,className=''}:{title:string;subtitle?:string;children:ReactNode;className?:string}) {return <section className={`af-panel ${className}`}><div className="af-panel-head"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><div className="af-panel-head-deco"><span/><span/><span/></div></div>{children}</section>}
export function Sparkline({points,color='#37e3de'}:{points:number[];color?:string}) {const min=Math.min(...points,0),max=Math.max(...points,1),span=Math.max(max-min,1);const xy=points.map((n,i)=>`${i*(100/Math.max(points.length-1,1))},${32-(n-min)/span*28}`).join(' ');return <svg viewBox="0 0 100 36" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true"><polyline fill="none" stroke={color} strokeWidth="2.3" points={xy} strokeLinecap="round" strokeLinejoin="round"/></svg>}
const sparks=[[31,42,37,57,51,65,60,76,80,74,91],[55,53,70,62,71,78,66,79,88,80,92],[69,74,60,72,65,80,72,83,76,91,95],[45,64,58,80,71,76,68,91,83,96,88]];
export function Tile({label,value,foot,tone='cyan',spark=true}:{label:string;value:string|number;foot?:string;tone?:'cyan'|'green'|'purple'|'orange';spark?:boolean}) {const idx=['cyan','green','purple','orange'].indexOf(tone);return <div className={`af-tile af-tone-${tone}`}><div className="af-tile-top"><span>{label}</span><span className="af-tile-icon"><ArrowUpRight size={14}/></span></div><strong>{value}</strong><div className="af-tile-bottom"><small>{foot||'Analytics snapshot'}</small>{spark&&<div className="af-tile-spark"><Sparkline points={sparks[idx]} color={['#37e3de','#48edb9','#bd8aff','#ffbd6c'][idx]}/></div>}</div></div>}
export function Status({loading,error,empty=false}:{loading:boolean;error:string|null;empty?:boolean}) {if(loading)return <div className="af-notice" role="status"><Activity size={15}/> AWS 데이터를 조회하는 중입니다…</div>;if(error)return <div className="af-notice af-error" role="alert"><ShieldCheck size={16}/><div>{error}<div className="af-detail-hint">AWS 리소스, IAM, FastAPI 확장 라우터와 접근 제어를 확인하세요. 실제 데이터를 시연 숫자로 대체하지 않습니다.</div></div></div>;if(empty)return <div className="af-notice"><Database size={16}/>표시할 관측 데이터가 없습니다. 기간과 데이터 연결을 확인하세요.</div>;return null}
export function Chip({children,tone='cyan'}:{children:ReactNode;tone?:'cyan'|'green'|'purple'|'orange'|'red'|'gray'}) {return <span className={`af-chip af-chip-${tone}`}>{children}</span>}
export function Empty({children}:{children:ReactNode}) {return <div className="af-empty-metric"><Box size={24}/><span>{children}</span></div>}
export function BarRow({label,value,max,color='#33d6e8'}:{label:string;value:number;max:number;color?:string}) {return <div className="af-bar-row"><span>{label}</span><div className="af-bar-track"><div style={{width:`${Math.max(0,Math.min(100,100*value/Math.max(max,1)))}%`,background:color}}/></div><b>{fmtNum(value)}</b></div>}
export function RoundMeter({value=0,label,color='#49edd1'}:{value?:number;label:string;color?:string}) {return <div className="af-meter" style={{background:`conic-gradient(${color} ${Math.max(0,Math.min(100,value))}%, #203147 0)`}}><div><strong>{Math.round(value)}%</strong><small>{label}</small></div></div>}
