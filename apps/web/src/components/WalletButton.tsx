import {useEffect,useRef,useState} from 'react';
import { Wallet } from 'lucide-react';
import { useWalletSession } from '../api/walletSession';
import './wallet-menu.css';
export function WalletButton(){
 const session=useWalletSession(),[open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!open)return;const close=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[open]);
 return <div className={`wallet-menu-root${session.identity?' wallet-menu-connected':''}`} ref={root} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setOpen(false);root.current?.querySelector('button')?.focus();}}}>
 <button aria-label={session.identity?'Open wallet account':'Connect wallet'} className="wallet-button" onClick={()=>{if(session.identity)setOpen(v=>!v);else session.open();}} disabled={session.busy} aria-expanded={session.identity?open:undefined} title={session.identity?'Open wallet account':'Connect and authenticate your Solana wallet'}><Wallet size={15}/><span>{session.identity?`${session.identity.wallet.slice(0,4)}…${session.identity.wallet.slice(-4)}`:'Connect wallet'}</span></button>
 {open&&session.identity&&<section className="wallet-account surface" aria-label="Wallet account"><p className="small">Authenticated wallet</p><code className="ui-select-text">{session.identity.wallet}</code><p className="small muted">To switch accounts, choose another account in your wallet and reconnect.</p><button className="secondary" disabled={session.busy} onClick={()=>{setOpen(false);void session.logout().then(()=>session.open());}}>Switch wallet</button><button className="text-button" disabled={session.busy} onClick={()=>{setOpen(false);void session.logout();}}>Sign out / Disconnect</button></section>}
 </div>;
}
