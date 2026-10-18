import { CurrentAgentWork, JobFacts, ProductionFacilities, WorkingAgents } from "./AgentWork";
import { observableTasks, workDescription } from "../api/agentWork";
import "../agent-work.css";
import { LaunchWorkspace } from "./LaunchWorkspace";
import { useWalletSession } from "../api/walletSession";
import { useEffect, useState } from "react";
import { useDraftField } from "../navigation/drafts";
import { LaunchQuotePicker } from "./LaunchQuotePicker";
import { LaunchLogoUpload } from "./LaunchLogoUpload";
import { FutureFees } from "./Ecosystem";
import { launchQuote, launchQuoteError, tradingPair } from "../api/launchQuotes";
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  Leaf,
  Package,
  Pause,
  Play,
  Plus,
  ShieldCheck,
  Truck,
  Users,
  Wheat,
  X,
} from "lucide-react";
import { type ApiAdapter, type Dashboard } from "../api/adapter";
import { agentIdentity, displayAgentName } from "../api/agentIdentity";
import {
  PROFESSIONS,
  CreateAgentRequest,
  type Agent,
  type AgentAction,
  type HolderEligibility,
} from "../api/shared";
export const readable = (s: string) =>
  s.replaceAll("_", " ").replaceAll(".", " ");
const credits = (n: number) =>
  (n / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 });
export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="notice">
      <CircleHelp size={17} />
      <span>{children}</span>
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="page-heading">
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}
export function Launchpad() {
  const session=useWalletSession();
  return session.available ? <LaunchWorkspace /> : <LocalLaunchpad />;
}
function LocalLaunchpad() {
  const session = useWalletSession();
  const [review, setReview] = useState(false),
    [name, setName, nameSaved] = useDraftField<string>("launchpad:name", ""),
    [symbol, setSymbol, symbolSaved] = useDraftField<string>("launchpad:symbol", ""),
    [description, setDescription, descriptionSaved] = useDraftField<string>("launchpad:description", ""),
    [imageUrl, setImageUrl, imageSaved] = useDraftField<string>("launchpad:image", ""),
    [metadataUrl, , metadataSaved] = useDraftField<string>("launchpad:metadata", ""),
    [quoteAsset, setQuoteAsset, quoteSaved] = useDraftField<string>("launchpad:quoteAsset", "SOL");
  const locallySaved = nameSaved && symbolSaved && descriptionSaved && imageSaved && metadataSaved && quoteSaved;
  const selectedQuote = launchQuote(quoteAsset), quoteError = launchQuoteError(quoteAsset);
  return (
    <>
      <PageHeading
        eyebrow="BUILD A PRESENCE"
        title="Give your community a home."
        description="Token Launchpad · Phase 2 in development. Prepare your community draft; verified Pump.fun execution and SOL/USDC launches are not enabled here."
      />
      <div className="two-column">
        <form
          className="surface"
          noValidate={!session.identity}
          onSubmit={(e) => {
            e.preventDefault();
            if (!session.identity) { session.open(); return; }
            if (!launchQuoteError(quoteAsset)) setReview(true);
          }}
        >
          <p className="small draft-storage" role="note">{locallySaved ? "Draft fields are retained in this browser tab, including across refresh. Not saved to the backend." : "Browser storage unavailable. Draft fields are kept while this app stays open; refreshing may lose them."}</p>
          <div className="surface-title">
            <h2>Token details</h2>
            <span className="tag">Draft only</span>
          </div>
          <label>
            Token name
            <input
              required
              maxLength={32}
              placeholder="Your community name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setReview(false);
              }}
            />
          </label>
          <label>
            Symbol
            <input
              required
              maxLength={13}
              pattern="[A-Za-z0-9$_.\-]+"
              placeholder="e.g. MOSS"
              value={symbol}
              onChange={(e) => {
                setSymbol(e.target.value);
                setReview(false);
              }}
            />
          </label>
          <label>
            Description
            <textarea
              maxLength={1000}
              rows={4}
              value={description}
              onChange={(e) => { setDescription(e.target.value); setReview(false); }}
              placeholder="What will your community build?"
            />
          </label>
          <LaunchLogoUpload selectionOnly automaticMetadata={false} name={name} symbol={symbol} description={description} quoteAsset={quoteAsset}
            imageUrl={imageUrl} onImage={(uri) => { setImageUrl(uri); setReview(false); }} />
          <details className="launch-advanced">
            <summary>Advanced image and metadata settings</summary>
            <label>Image URL
              <input type="url" placeholder="https://…" value={imageUrl} onChange={(e) => { setImageUrl(e.target.value); setReview(false); }} />
            </label>
            <p className="small muted">Manual image URLs still require backend validation. They do not count as verified uploads.</p>
            <label>Metadata URL
              <input type="url" value={metadataUrl} readOnly disabled placeholder="Automatic metadata · backend integration pending" />
            </label>
            <p className="small muted">Manual metadata overrides are unavailable until the backend can validate them. Any previous draft value is retained.</p>
          </details>
          <LaunchQuotePicker value={quoteAsset} symbol={symbol} onChange={(quote) => { setQuoteAsset(quote); setReview(false); }} />
          <button className="primary wide" type="submit" disabled={!!session.identity && !!quoteError}>
            {session.identity ? <>Review draft <ArrowRight size={16} /></> : "Connect wallet"}
          </button>
          {review && !quoteError && selectedQuote && (
            <section className="launch-review" aria-label="Launch draft review">
              <div className="review-result" role="status">
                <Check size={17} /> Draft reviewed: {name} ({symbol}). No transaction created.
              </div>
              <dl className="fee-list">
                <div><dt>Logo</dt><dd>{imageUrl ? "Reference provided · backend verification required" : "Not uploaded"}</dd></div>
                <div><dt>Metadata readiness</dt><dd>Automatic preparation awaits backend API</dd></div>
                <div><dt>Trading pair</dt><dd>{tradingPair(symbol, selectedQuote.asset)}</dd></div>
                <div><dt>Quote asset</dt><dd>{selectedQuote.label}</dd></div>
                <div><dt>Initial token price ({selectedQuote.asset})</dt><dd>Unavailable — backend quote required</dd></div>
                <div><dt>Network &amp; account costs (SOL)</dt><dd>Backend estimate required</dd></div>
              </dl>
              <p className="small muted">The fixed platform charge remains 0.05 SOL, independent of the pair. No transaction total is quoted or approved. The backend must verify the quote mint, costs, and fee routing before wallet confirmation can be offered.</p>
            </section>
          )}
        </form>
        <aside>
          <section className="surface">
            <h2>A clear fee structure</h2>
            <dl className="fee-list">
              <div>
                <dt>Platform launch charge</dt>
                <dd>0.05 SOL</dd>
              </div>
              <div>
                <dt>Platform receives launch charge</dt>
                <dd>100%</dd>
              </div>
              <div>
                <dt>Launcher creator-fee share</dt>
                <dd>0%</dd>
              </div>
              <div>
                <dt>Network & account costs</dt>
                <dd>Backend estimate required</dd>
              </div>
            </dl>
            <div className="split-bar">
              <span>60% agent rewards</span>
              <span>40% platform</span>
            </div>
            <p className="small muted">
              Target split of eligible, verified creator-fee receipts in their actual received asset, where
              supported and verified. Protocol and liquidity-provider fees
              remain governed by Pump.fun.
            </p>
            <hr />
            <button className="secondary wide" disabled>
              Wallet signing unavailable
            </button>
            <p className="small muted">
              Backend-prepared transactions and verified wallet integration are
              required. Financial actions are disabled in this frontend preview.
            </p>
          </section>
          <div className="launch-steps">
            <b>Planned launch lifecycle</b>
            <span>Draft → Wallet approval → Submitted</span>
            <span>Confirmed / Failed / Recovery needed</span>
          </div>
        </aside>
      </div>
    </>
  );
}
export function Studio({
  data,
  api,
  onAgent,
  onRefresh,
}: {
  data: Dashboard;
  api: ApiAdapter;
  onAgent: (id: string) => void;
  onRefresh: () => void;
}) {
  const draftKey = `studio:${api.kind}:`;
  const [name, setName, nameSaved] = useDraftField<string>(draftKey + "name", ""),
    [community, setCommunity, communitySaved] = useDraftField<string>(draftKey + "community", data.communities[0]?.id ?? ""),
    [profession, setProfession, professionSaved] = useDraftField<string>(draftKey + "profession", "farmer"),
    [risk, setRisk, riskSaved] = useDraftField<string>(draftKey + "risk", "low"),
    [temperament, setTemperament, temperamentSaved] = useDraftField<string>(draftKey + "temperament", "cooperative"),
    [objective, setObjective, objectiveSaved] = useDraftField<string>(draftKey + "objective", "reliability"),
    [budget, setBudget, budgetSaved] = useDraftField<number>(draftKey + "budget", 100),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [eligibility, setEligibility] = useState<HolderEligibility | null>(null);
  const demo = api.kind === "demo";
  const check = async () => {
    setBusy(true);
    setMessage("");
    try {
      setEligibility(await api.eligibility(community));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Eligibility check failed");
    } finally {
      setBusy(false);
    }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!demo) { setMessage("Token-linked activation is unavailable until the backend verifies the one-token, one-agent, one-wallet relationship."); return; }
    if (!eligibility?.eligible) {
      setMessage("Check holder eligibility first.");
      return;
    }
    setBusy(true);
    try {
      const input = CreateAgentRequest.parse({
        name,
        communityId: community,
        profession,
        strategy: {
          dailyBudget: Math.round(budget * 1000),
          risk,
          temperament,
          objective,
        },
      });
      await api.createAgent(input);
      setMessage(
        demo
          ? "Demo agent activated. No wallet access or on-chain action."
          : "Agent activated by the server.",
      );
      setName("");
      onRefresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Activation failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeading
        eyebrow="AUTONOMY, WITH INTENTION"
        title="Meet your next city worker."
        description="Explore supported city workers today. Holder-access Common Agents and a separate rentable Super-Agent class are planned; neither entitlement system is live."
      />
      <Notice>Common Agents are planned for qualifying holdings; Super Agents are a separate future class rented by locking $AECO. Multiple holder-based positions and rentals are not enabled in today’s demo.</Notice>
      <div className="two-column">
        <form className="surface" onSubmit={submit}>
          <h2>Agent configuration</h2>
          <p className="small draft-storage" role="note">{nameSaved && communitySaved && professionSaved && riskSaved && temperamentSaved && objectiveSaved && budgetSaved ? "Configuration fields are retained in this browser tab. Eligibility and activation must be checked again; no agent has been created by saving this draft." : "Browser storage unavailable. Configuration stays in this running app; refreshing may lose changes."}</p>
          <p className="small">One token mint · one token-linked agent · one verified activating wallet. Token holdings alone do not establish ownership.</p>
          {!demo && <p role="status" className="small">Token-linked activation unavailable: the backend activation identity contract is not yet published. Existing city agents remain available to inspect.</p>}
          {demo && <p className="small">Offline demo creates house agents only. No wallet or token ownership is assigned.</p>}
          <label>
            Agent name
            <input
              required
              minLength={2}
              maxLength={32}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Give your agent a name"
            />
          </label>
          <label>
            Community
            <select
              value={community}
              onChange={(e) => {
                setCommunity(e.target.value);
                setEligibility(null);
              }}
            >
              {data.communities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="eligibility">
            <ShieldCheck size={18} />
            <span>
              {eligibility
                ? `${eligibility.eligible ? "Eligible" : "Not eligible"} · ${eligibility.source === "mock_chain" ? "fixture balance" : "server-verified balance"} · threshold ${Number(eligibility.threshold) / 10 ** eligibility.decimals} tokens`
                : demo
                  ? "Demo holder eligibility uses fixture balances."
                  : "Holder balance must be verified by the backend."}
            </span>
            <button
              type="button"
              className="text-button"
              onClick={check}
              disabled={busy || !community || !demo}
            >
              Check
            </button>
          </div>
          <label>
            Profession
            <select
              value={profession}
              onChange={(e) => setProfession(e.target.value)}
            >
              {PROFESSIONS.map((p) => (
                <option key={p} value={p}>
                  {readable(p)}
                </option>
              ))}
            </select>
          </label>
          <div className="form-row">
            <label>
              Temperament
              <select
                value={temperament}
                onChange={(e) => setTemperament(e.target.value)}
              >
                {["cooperative", "balanced", "competitive"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Risk
              <select value={risk} onChange={(e) => setRisk(e.target.value)}>
                {["low", "medium", "high"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Objective
            <select
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
            >
              {["reliability", "profitability", "expansion"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Daily simulated budget · {budget} City Credits
            <input
              type="range"
              min={0}
              max={1000}
              step={10}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
            />
          </label>
          <button
            className="primary wide"
            disabled={busy || !eligibility?.eligible || !community || !demo}
          >
            {busy
              ? "Working…"
              : demo
                ? "Activate demo agent"
                : "Token activation unavailable"}{" "}
            <Plus size={16} />
          </button>
          {message && (
            <p role="status" className="small">
              {message}
            </p>
          )}
        </form>
        <aside className="surface">
          <div className="surface-title">
            <h2>City agents</h2>
            <span className="tag">{data.agents.length}</span>
          </div>
          <div className="agent-list">
            {data.agents.slice(0, 14).map((a) => (
              <button
                key={a.id}
                className="agent-row"
                onClick={() => onAgent(a.id)}
              >
                <span className="avatar">{a.name.slice(0, 1)}</span>
                <span>
                  <b>{displayAgentName(a)}</b>
                  <small>{data.identitySource === "backend" ? `${a.name} · ` : ""}{readable(a.profession)}</small>
                </span>
                <span
                  className={`status ${a.status === "paused" ? "paused" : ""}`}
                >
                  {a.status}
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
          {!data.agents.length && (
            <div className="empty">
              No agents yet. Activate the first worker.
            </div>
          )}
          <Notice>
            City Credits are simulated and non-withdrawable. Agents cannot sign
            transactions or spend from your wallet.
          </Notice>
        </aside>
      </div>
    </>
  );
}
export function Economy({ data, onViewBuilding, onViewAgent, onHighlight }: { data: Dashboard; onViewBuilding?: (id:string)=>void; onViewAgent?: (id:string)=>void; onHighlight?: (ids:string[])=>void }) {
  return (
    <>
      <PageHeading
        eyebrow="A SHARED WORKING ECONOMY"
        title="From fields to front doors."
        description="Finite resources. Useful services. A city that works together."
      />
      <Notice>Credits are simulation units, not withdrawable tokens. Funded, performance-based $AECO conversion and advanced agent businesses are planned; no conversion rate or payout is guaranteed.</Notice>
      <div className="production-flow">
        {[
          {
            icon: Wheat,
            label: "Wheat",
            place: "Farm",
            amount: data.stats.goodsProduced.wheat ?? 0,
          },
          {
            icon: Package,
            label: "Flour",
            place: "Mill",
            amount: data.stats.goodsProduced.flour ?? 0,
          },
          {
            icon: Leaf,
            label: "Bread",
            place: "Bakery",
            amount: data.stats.goodsProduced.bread ?? 0,
          },
          {
            icon: Users,
            label: "Residents",
            place: "Demand sink",
            amount: data.stats.goodsConsumed.bread ?? 0,
          },
        ].map(({ icon: Icon, label, place, amount }, i) => (
          <div key={label}>
            <span className="flow-icon">
              <Icon size={25} />
            </span>
            <b>{label}</b>
            <small>{place}</small>
            <strong>
              {amount.toLocaleString()} {i === 3 ? "consumed" : "produced"}
            </strong>
            {i < 3 && <ArrowRight className="flow-arrow" size={22} />}
          </div>
        ))}
      </div>
      <ProductionFacilities data={data} onViewBuilding={onViewBuilding} onHighlight={onHighlight}/>
      <WorkingAgents data={data} onViewAgent={onViewAgent}/>
      <div className="two-column economy-panels">
        <section className="surface scroll-panel economy-panel" aria-labelledby="resource-market-title">
          <h2 id="resource-market-title">Resource market</h2>
          <p className="muted small">
            Prices in simulated City Credits per unit
          </p>
          <div className="table-wrap panel-scroll-content slim-scroll" role="region" aria-label="Resource market rows" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {data.markets.quotes.map((q) => (
                  <tr key={q.resource}>
                    <td className="capitalize">{q.resource}</td>
                    <td>{credits(q.price)} CC</td>
                    <td>{q.supply}</td>
                    <td
                      className={q.changePct24h >= 0 ? "positive" : "negative"}
                    >
                      {q.changePct24h >= 0 ? "+" : ""}
                      {q.changePct24h}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="surface scroll-panel economy-panel" aria-labelledby="work-queue-title">
          <h2 id="work-queue-title">Useful work queue</h2>
          <div className="panel-scroll-content slim-scroll" role="region" aria-label="Useful work entries" tabIndex={0}>
          {observableTasks(data.tasks,data.agents).map((t) => (
            <div className="task-row" key={t.id}>
              <Truck size={18} />
              <span>
                <b>{readable(t.kind)}</b>
                <JobFacts task={t} data={data} onViewBuilding={onViewBuilding} onViewAgent={onViewAgent}/>
              </span>
              <span className="tag">{t.status}</span>
            </div>
          ))}
          {!data.tasks.length && (
            <div className="empty">The work queue is empty.</div>
          )}
          </div>
        </section>
      </div>
      <Notice>
        These figures describe a simulated economy. City Credits have no SOL
        conversion or withdrawal mechanism. Contribution points do not guarantee
        a real payout.
      </Notice>
    </>
  );
}
export function Treasury({ data }: { data: Dashboard }) {
  const t = data.treasury;
  const totals = t.launchFees.totals;
  return (
    <>
      <PageHeading
        eyebrow="TRANSPARENCY BY DESIGN"
        title="Every stream, accounted for."
        description="Launch charges and eligible creator fees are separate. Current demo receipts and proposed future policies remain distinct; real settlements and rewards are disabled."
      />
      {data.mode === "demo" && (
        <Notice>
          Backend demo receipts use a mock chain. These are simulated receipts;
          no SOL was transferred. Real blockchain transactions and payouts
          remain disabled.
        </Notice>
      )}
      <div className="treasury-grid">
        <section className="surface">
          <span className="eyebrow">LAUNCH CHARGE</span>
          <h2 className="big-number">
            0.05 <small>SOL</small>
          </h2>
          <p>100% to the platform treasury</p>
          <hr />
          <div className="compact-list">
            {totals.map((a) => (
              <div key={a.assetMint}>
                <span>{a.assetSymbol}</span>
                <b>
                  {formatAmount(a.finalized, a.decimals)} finalized ·{" "}
                  {formatAmount(a.pending, a.decimals)} pending
                </b>
              </div>
            ))}
          </div>
          {!totals.length && (
            <p className="muted small">
              No on-chain launch receipts in this preview.
            </p>
          )}
        </section>
        <section className="surface">
          <span className="eyebrow">ELIGIBLE CREATOR FEES RECEIVED</span>
          <h2 className="big-number">
            60 <small>/</small> 40
          </h2>
          <div className="split-bar">
            <span>Agent treasury</span>
            <span>Platform</span>
          </div>
          <p className="small muted">
            Human-launched tokens: 0% to the launcher. Applies only to eligible,
            verified creator fees actually received; excludes protocol and liquidity-provider fees.
          </p>
          <span className="tag">
            Routing {t.feeRouting.verified ? "verified" : "unverified"}
          </span>
          <p className="small">{t.feeRouting.notes.join(" ")}</p>
        </section>
        <section className="surface">
          <ShieldCheck size={27} />
          <h2>Contribution points</h2>
          <p>{t.payouts.description}</p>
          <span className="tag">Dry run · payouts disabled</span>
          <p className="small muted">
            No passive rewards, automatic buybacks, or guaranteed payouts. $AECO
            is a future token and is not live.
          </p>
        </section>
      </div>
      <section className="surface"><h2>Future creator-fee policy</h2><FutureFees /></section>
      <section className="surface scroll-panel receipt-ledger" aria-labelledby="receipt-ledger-title">
        <div className="surface-title">
          <h2 id="receipt-ledger-title">Public receipt ledger</h2>
          <span className="tag">{readable(t.creatorFees.reconciliation)}</span>
        </div>
        <div className="table-wrap panel-scroll-content slim-scroll ui-select-text" role="region" aria-label="Public receipt rows" tabIndex={0}>
        {t.recentEntries.length ? (
            <table>
              <thead>
                <tr>
                  <th>Stream</th>
                  <th>Account</th>
                  <th>Amount</th>
                  <th>Finality</th>
                </tr>
              </thead>
              <tbody>
                {t.recentEntries.map((e) => (
                  <tr key={e.id}>
                    <td>{readable(e.stream)}</td>
                    <td>{readable(e.account)}</td>
                    <td>
                      {formatAmount(e.amount, e.decimals)} {e.assetSymbol}
                    </td>
                    <td>{e.finality}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        ) : (
          <div className="empty">
            <ShieldCheck size={24} />
            <h3>No confirmed receipts</h3>
            <p>
              {data.mode === "demo"
                ? "Demo mode does not execute transactions or fabricate chain receipts."
                : "Confirmed receipts will appear when indexed by the backend."}
            </p>
          </div>
        )}
        </div>
      </section>
    </>
  );
}
export function formatAmount(amount: string, decimals: number) {
  const padded = amount.padStart(decimals + 1, "0");
  if (!decimals) return padded;
  return (
    `${padded.slice(0, -decimals)}.${padded.slice(-decimals)}`.replace(
      /\.?0+$/,
      "",
    ) || "0"
  );
}
export function AgentPanel({
  id,
  api,
  onClose,
  onRefresh,
  liveActions,
  onFollow,
  following,
  data,
  onViewBuilding,
}: {
  id: string;
  api: ApiAdapter;
  onClose: () => void;
  onRefresh: () => void;
  liveActions?: AgentAction[];
  onFollow?: (x: number, y: number) => void;
  following?: boolean;
  data?: Dashboard;
  onViewBuilding?: (id:string)=>void;
}) {
  const [agent, setAgent] = useState<Agent | null>(null),
    [logs, setLogs] = useState<AgentAction[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true,
      busy = false;
    setAgent(null);
    setError("");
    const update = () => {
      if (busy) return;
      busy = true;
      void Promise.all([api.agentDetails(id), api.agentLog(id)])
        .then(([a, l]) => {
          if (live) {
            setAgent(a);
            setLogs(l);
          }
        })
        .catch((e) => {
          if (live) setError(String(e));
        })
        .finally(() => {
          busy = false;
        });
    };
    update();
    const timer = api.kind === "http" ? setInterval(update, 3000) : undefined;
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [id, api]);
  const observed = agent && data?.agents.find(a=>a.id===agent.id);
  const displayed = agent && observed && (observed.work?.tick ?? -1) >= (agent.work?.tick ?? -1) ? {...agent,...observed} : agent;
  const toggle = async () => {
    if (!agent) return;
    setBusy(true);
    setError("");
    try {
      await api.updateAgent(id, {
        status: agent.status === "active" ? "paused" : "active",
      });
      setAgent(await api.agentDetails(id));
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <aside className="selection-panel agent-detail" aria-label="Agent details">
      <button
        className="close"
        aria-label="Close agent details"
        onClick={onClose}
      >
        <X size={20} />
      </button>
      <div className="eyebrow">AGENT PROFILE</div>
      {error && <p role="alert">{error}</p>}
      {!agent && !error && <p role="status">Loading agent…</p>}
      {agent && (
        <>
          <h2>{displayAgentName(agent)}</h2>
          <span className="tag">
            {readable(agent.profession)} · {agent.status}
          </span>
          {onFollow && (
            <button
              className="secondary wide"
              onClick={() => onFollow(displayed?.pos.x??agent.pos.x, displayed?.pos.y??agent.pos.y)}
            >
              {following ? "Stop following agent" : "Follow agent"} <ArrowRight size={14} />
            </button>
          )}
          {data&&displayed&&<CurrentAgentWork agent={displayed} data={data} onViewBuilding={onViewBuilding}/>}
          <dl className="detail-list">
            <div><dt>Canonical ID</dt><dd className="agent-identity-value" data-testid="agent-canonical-id">{agent.id}</dd></div>
            <div><dt>Given name</dt><dd>{agent.name}</dd></div>
            <div><dt>Identity type</dt><dd>{agentIdentity(agent).kind === "unclassified" ? "Unclassified legacy agent" : readable(agentIdentity(agent).kind)}</dd></div>
            <div><dt>Verified activating wallet</dt><dd className="agent-identity-value" data-testid="agent-owner">{agentIdentity(agent).owner ?? "Unavailable · no verified activation record"}</dd></div>
            <div><dt>Current activity</dt><dd>{workDescription(displayed??agent)}</dd></div>
            <div>
              <dt>City Credits</dt>
              <dd>{credits(displayed?.credits??agent.credits)} CC</dd>
            </div>
            <div>
              <dt>Verified tasks</dt>
              <dd>{displayed?.verifiedTasks??agent.verifiedTasks}</dd>
            </div>
            <div>
              <dt>Contribution points</dt>
              <dd>{displayed?.points??agent.points}</dd>
            </div>
            <div>
              <dt>Daily budget</dt>
              <dd>{credits(agent.strategy.dailyBudget)} CC</dd>
            </div>
            <div>
              <dt>Cargo</dt>
              <dd>
                {Object.entries(displayed?.work?.cargo??agent.cargo)
                  .map(([k, v]) => `${v} ${k}`)
                  .join(", ") || "Empty"}
              </dd>
            </div>
          </dl>
          <button
            className="secondary wide"
            disabled={busy || api.kind === "http"}
            onClick={toggle}
          >
            {agent.status === "active" ? (
              <Pause size={15} />
            ) : (
              <Play size={15} />
            )}{" "}
            {agent.status === "active" ? "Pause agent" : "Resume agent"}
          </button>
          {api.kind === "http" && (
            <p className="small muted">
              Read-only until wallet sign-in is connected. Backend ownership
              checks protect agent controls.
            </p>
          )}
          <p className="small">Resource preferences: {agent.strategy.preferredResources.join(", ")||"Any permitted resource"} · earned {credits(agent.performance.creditsEarned)} simulated CC</p>
          <h3>Decision log</h3>
          {[
            ...new Map(
              [
                ...(liveActions ?? []).filter((a) => a.agentId === id),
                ...logs,
              ].map((log) => [log.id, log]),
            ).values(),
          ]
            .sort((a, b) => b.tick - a.tick)
            .slice(0, 5)
            .map((log) => (
              <div className="decision-log" key={log.id}>
                <b>{readable(log.kind)}</b>
                <p>{log.reason}</p>
                <small>
                  Tick {log.tick} · utility {log.utility.toFixed(2)}
                </small>
              </div>
            ))}
          {!logs.length && <p className="muted">No decisions yet.</p>}
        </>
      )}
    </aside>
  );
}
