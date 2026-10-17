import { Wallet } from 'lucide-react';
import { useWalletSession } from '../api/walletSession';
export function WalletButton(){const session=useWalletSession();return <button className="wallet-button" onClick={()=>{if(session.identity)void session.logout();else session.open();}} disabled={session.busy} title={session.identity?'Sign out and revoke this session':'Connect and authenticate your Solana wallet'}><Wallet size={15}/><span>{session.identity?`${session.identity.wallet.slice(0,4)}…${session.identity.wallet.slice(-4)} · Sign out`:'Connect wallet'}</span></button>;}
