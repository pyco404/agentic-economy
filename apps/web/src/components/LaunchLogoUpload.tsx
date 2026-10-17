import { useEffect, useRef, useState } from "react";
import { ImagePlus, Upload, X } from "lucide-react";
import { useDraftField } from "../navigation/drafts";
import { launchQuoteError } from "../api/launchQuotes";
import { abortable, IpfsReference, LogoReference, LOGO_LIMITS, metadataKey, readLogoReference, unavailableLaunchMedia, validateLogo,
  type LaunchMediaAdapter, type MetadataInput } from "../api/launchMedia";

// A file survives route changes in memory, never browser storage. Refresh needs reselection.
let pending: { file: File; requestId: string; scope:string } | null = null;
export function LaunchLogoUpload({ name, symbol, description, quoteAsset, imageUrl, onImage,
  adapter = unavailableLaunchMedia, automaticMetadata=true, trustedImage=null, scope="local", maxBytes=LOGO_LIMITS.maxBytes }: {
  name: string; symbol: string; description: string; quoteAsset: string; imageUrl: string;
  onImage: (uri: string) => void; adapter?: LaunchMediaAdapter; automaticMetadata?:boolean; trustedImage?:LogoReference|null; scope?:string; maxBytes?:number;
}) {
  const [stored, saveReference] = useDraftField<string>((scope==="local"?"launchpad:":scope+":")+"logoReference", "");
  const [hint, saveHint] = useDraftField<string>((scope==="local"?"launchpad:":scope+":")+"pendingLogo", "");
  const [metadata, saveMetadata] = useDraftField<string>((scope==="local"?"launchpad:":scope+":")+"preparedMetadata", "");
  const [file, setFile] = useState<File | null>(pending?.scope===scope ? pending.file : null), [preview, setPreview] = useState("");
  const [state, setState] = useState<"idle" | "validating" | "uploading" | "success" | "error">("idle");
  const [error, setError] = useState(""), [progress, setProgress] = useState(0);
  const [metadataState, setMetadataState] = useState("idle"), [metadataError, setMetadataError] = useState("");
  const [retry, setRetry] = useState(0);
  const input = useRef<HTMLInputElement>(null), operation = useRef(0), active = useRef<AbortController | null>(null), busy = useRef(false);
  const savedReference = readLogoReference(stored);
  const reference = trustedImage ?? (savedReference?.ipfsUri === imageUrl ? savedReference : null);
  const metadataInput: MetadataInput = { name: name.trim(), symbol: symbol.trim(), description: description.trim(), quoteAsset, imageUploadId: reference?.uploadId ?? "" };
  const key = metadataKey(metadataInput);
  let prepared: IpfsReference | null = null;
  try { const saved = JSON.parse(metadata); if (saved.key === key) prepared = IpfsReference.parse(saved.reference); } catch { /* Stale or absent draft metadata. */ }
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => () => { operation.current++; active.current?.abort(); }, []);
  useEffect(() => {
    setMetadataError("");
    if (!automaticMetadata || !adapter.available || launchQuoteError(quoteAsset) || !metadataInput.imageUploadId || !metadataInput.name || !metadataInput.symbol) { setMetadataState("idle"); return; }
    const controller = new AbortController(); let alive = true;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      setMetadataState("preparing");
      deadline = setTimeout(() => controller.abort(), 90_000);
      const currentInput = JSON.parse(key) as MetadataInput;
      void abortable(adapter.prepareMetadata(currentInput, { requestId: crypto.randomUUID(), signal: controller.signal }), controller.signal).then((result) => {
        if (alive) { saveMetadata(JSON.stringify({ key, reference: IpfsReference.parse(result) })); setMetadataState("ready"); }
      }).catch(() => { if (alive) { setMetadataState("error"); setMetadataError("Metadata preparation failed or timed out. Retry safely; no launch was started."); } }).finally(() => clearTimeout(deadline));
    }, 600);
    return () => { alive = false; clearTimeout(timer); clearTimeout(deadline); controller.abort(); };
    // The stable serialized key includes every reviewed metadata input.
  }, [automaticMetadata, adapter, key, retry, saveMetadata, quoteAsset, metadataInput.imageUploadId, metadataInput.name, metadataInput.symbol]);
  const choose = async (candidate?: File) => {
    if (!candidate) return;
    const version = ++operation.current; active.current?.abort(); busy.current = false;
    setState("validating"); setError("");
    try {
      await validateLogo(candidate,maxBytes);
      if (version !== operation.current) return;
      pending = { file: candidate, requestId: crypto.randomUUID(),scope }; setFile(candidate); saveHint(candidate.name);
      saveReference(""); saveMetadata(""); onImage(""); setState("idle");
    } catch (e) { if (version === operation.current) { setState("error"); setError(e instanceof Error ? e.message : "Unable to read this image."); } }
  };
  const upload = async () => {
    if (!adapter.available || !pending || pending.scope!==scope || busy.current) return;
    busy.current = true; const version = ++operation.current, selected = pending;
    const controller = new AbortController(); active.current = controller;
    setState("uploading"); setProgress(0); setError("");
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      const result = LogoReference.parse(await abortable(adapter.uploadLogo(selected.file, { requestId: selected.requestId, signal: controller.signal,
        onProgress: (percent) => { if (version === operation.current && Number.isFinite(percent)) setProgress(Math.max(0, Math.min(100, percent))); } }), controller.signal));
      if (version !== operation.current || controller.signal.aborted) return;
      saveReference(JSON.stringify(result)); onImage(result.ipfsUri); saveHint(""); pending = null; setFile(null); setState("success");
    } catch (cause) {
      if (version === operation.current) { setState("error"); setError(controller.signal.aborted ? "Upload cancelled or timed out. You can retry." : cause instanceof Error ? cause.message : "Upload failed or was rejected. Retry after checking your connection and authentication."); }
    } finally { clearTimeout(timeout); if (version === operation.current) busy.current = false; }
  };
  const remove = () => {
    operation.current++; active.current?.abort(); busy.current = false; pending = null; setFile(null);
    saveHint(""); saveReference(""); saveMetadata(""); onImage(""); setState("idle"); setError("");
    if (input.current) input.current.value = "";
  };
  return <section className="launch-logo" aria-labelledby="launch-logo-title">
    <h3 id="launch-logo-title">Token logo</h3>
    <div className="logo-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void choose(event.dataTransfer.files[0]); }}>
      {preview || reference ? <img src={preview || reference!.gatewayUrl} alt="Token logo preview" /> : <ImagePlus size={30} aria-hidden="true" />}
      <input ref={input} type="file" className="logo-file-input" aria-label="Token logo file" accept={LOGO_LIMITS.mimeTypes.join(",")}
        onChange={(event) => { void choose(event.target.files?.[0]); event.target.value = ""; }} />
      <button type="button" className="secondary" onClick={() => input.current?.click()}>{file || reference ? "Replace image" : "Upload Token Logo"}</button>
      <p className="small muted">Drop an image here or browse. PNG, JPEG or WebP · up to {maxBytes / 1_000_000} MB.</p>
      {file && <span className="small">{file.name}</span>}
    </div>
    <div className="logo-actions">
      {file && <button type="button" className="secondary" disabled={!adapter.available || state === "uploading" || state === "validating"} onClick={() => void upload()}><Upload size={14} /> {state === "error" ? "Retry upload" : "Upload to IPFS"}</button>}
      {(file || reference || hint || imageUrl) && <button type="button" className="text-button" onClick={remove}><X size={14} /> Remove image</button>}
      {state === "uploading" && <button type="button" className="text-button" onClick={() => active.current?.abort()}>Cancel upload</button>}
    </div>
    <div aria-live="polite" className="small logo-status">
      {state === "validating" && "Checking image content…"}
      {state === "uploading" && <><progress max={100} value={progress} aria-label="Logo upload progress" /> Uploading {Math.round(progress)}% · server verification follows</>}
      {reference && <><span>{state === "success" ? "Logo uploaded and verified. No token launched." : "Saved IPFS logo reference. The backend must revalidate it before launch."}</span><code className="ui-select-text">{reference.ipfsUri}</code></>}
      {!file && hint && !reference && <span>Select {hint} again to upload it. Image files are not stored in browser storage.</span>}
    </div>
    {error && <p role="alert" className="small">{error}</p>}
    {!adapter.available && <p className="small muted">{adapter.unavailableReason}</p>}
    {automaticMetadata && <div className="logo-metadata" aria-label="Metadata readiness">
      <b>Metadata {prepared ? "prepared" : metadataState === "preparing" ? "preparing…" : "not ready"}</b>
      <p className="small muted">{prepared ? "Prepared for these token details. Backend review is required before any launch." : "The backend will prepare metadata automatically from your latest token details and verified logo. No manual JSON is needed."}</p>
      {prepared && <code className="ui-select-text">{prepared.ipfsUri}</code>}
      {metadataError && <><p role="alert" className="small">{metadataError}</p><button type="button" className="secondary" onClick={() => setRetry((n) => n + 1)}>Retry metadata</button></>}
    </div>}
  </section>;
}
