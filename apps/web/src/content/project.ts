/** Official platform identity. Never use these URLs as defaults for token socials. */
export const project = {
 name:'Agentic Economy',tagline:'A World That Works',website:'https://useaeco.xyz',
 staging:'https://staging.useaeco.xyz',x:'https://x.com/useaeco',github:'https://github.com/pyco404/agentic-economy',
} as const;

/** Finalized official Solana Mainnet token; never a default for user-created tokens. */
export const officialToken = {
 mint: "ZjUr8cr2fxQoBrv8zh4n752yQmcTFVgr3z5MgZeAeco",
 get solscanUrl() { return `https://solscan.io/token/${this.mint}`; },
} as const;
