/**
 * Per-node row for a CMS source. Used by both the per-source section
 * (`SearchResults`) and the merged grid (`MergedSearchResults`) via the shared
 * `resolveResultRenderer` (UI-owned) whenever `source.kind === "cms"`.
 *
 * Renders a title, a published-date subtitle, an optional content-type badge,
 * and a react-router `<Link>` when a route can be built.
 *
 * Link target:
 *   - `source.routePattern` tokens: `:id` (managedContentId), `:key`
 *     (managedContentKey), `:contentType` (contentType).
 *   - falls back to `/content/:contentType/:id` when no `routePattern` is
 *     configured.
 *
 * The content-type label is rendered only when its FQN passes `isValidCmsFqn`.
 */

import type { ReactNode } from "react";
import { Link } from "react-router";
import type { CmsSourceConfig, CmsSearchItem } from "../../adapters/cms/types";
import { formatContentTypeLabel, isValidCmsFqn } from "../../adapters/cms/contentTypeUtils";

const EM_BLOCK_SPLIT = /(<(?:em)>[\s\S]*?<\/(?:em)>)/g;
const EM_BLOCK_EXEC = /^<(?:em)>([\s\S]*?)<\/(?:em)>$/;
const STRAY_TAG = /<\/?[a-zA-Z][^>]*>/g;
const ROUTE_TOKEN = /:([A-Za-z_][A-Za-z0-9_]*)/g;

/** Formats an ISO date string for display; echoes the raw string on failure. */
function formatPublishedDate(dateStr: string): string {
	const date = new Date(dateStr);
	if (isNaN(date.getTime())) return dateStr;
	return date.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

/**
 * Substitutes `:id` / `:key` / `:contentType` tokens in a route pattern with
 * the item's values (URL-encoded). Returns `null` if a required token has no
 * value.
 */
function resolveRoute(pattern: string, item: CmsSearchItem): string | null {
	const tokens: Record<string, string | undefined> = {
		id: item.managedContentId,
		key: item.managedContentKey,
		contentType: item.contentType,
	};
	let failed = false;
	const out = pattern.replace(ROUTE_TOKEN, (_match, token: string) => {
		const value = tokens[token];
		if (value == null || value === "") {
			failed = true;
			return "";
		}
		return encodeURIComponent(value);
	});
	return failed ? null : out;
}

/**
 * - Decodes every HTML entity the browser knows (named + numeric).
 * - Runs twice to unwrap the double-encoding CMS search sometimes returns.
 */
function decodeEntities(input: string): string {
	if (typeof document === "undefined") return input;
	const el = document.createElement("textarea");
	const pass = (s: string) => {
		el.innerHTML = s;
		return el.value;
	};
	return pass(pass(input));
}

/**
 * Parses a snippet that may contain `<em>…</em>` segments and renders it as highlighted text,
 * and strips any other HTML tags so their content renders as plain text.
 */
function renderHighlightedSnippet(snippet: string): ReactNode[] {
	const decoded = decodeEntities(snippet);
	const parts = decoded.split(EM_BLOCK_SPLIT);
	return parts.map((part, i) => {
		const emphasisMatch = EM_BLOCK_EXEC.exec(part);
		if (emphasisMatch) {
			return (
				<mark key={i} className="bg-yellow-200 dark:bg-yellow-700/60 rounded-sm px-0.5">
					{emphasisMatch[1].replace(STRAY_TAG, "")}
				</mark>
			);
		}
		return part.replace(STRAY_TAG, "");
	});
}

function toPlainText(raw: string): string {
	return decodeEntities(raw).replace(STRAY_TAG, "");
}

interface CmsResultRowProps {
	node: unknown;
	source: CmsSourceConfig;
}

export function CmsResultRow({ node, source }: CmsResultRowProps) {
	const item = node as CmsSearchItem;

	const publishedDate = item.managedContentChannelDeliveryDetails?.[0]?.publishedDate;
	const showType = typeof item.contentType === "string" && isValidCmsFqn(item.contentType);

	const subtitleParts: string[] = [];
	if (showType) subtitleParts.push(formatContentTypeLabel(item.contentType));
	if (publishedDate) subtitleParts.push(`Published: ${formatPublishedDate(publishedDate)}`);

	const content: ReactNode = (
		<>
			<span className="font-medium">{item.title ? renderHighlightedSnippet(item.title) : "—"}</span>
			{item.highlightedSnippet && (
				<p className="text-sm text-neutral-600 dark:text-neutral-300">
					{renderHighlightedSnippet(item.highlightedSnippet)}
				</p>
			)}
			{subtitleParts.length > 0 && (
				<p className="text-sm text-neutral-600 dark:text-neutral-300">
					{subtitleParts.join(" · ")}
				</p>
			)}
		</>
	);

	// Only render a drill-down link when the source explicitly configures a
	// routePattern. Without one, content rows render as plain (non-linked) rows
	// so they never navigate to an unbuilt detail route.
	const href = source.routePattern ? resolveRoute(source.routePattern, item) : null;
	if (href) {
		return (
			<Link
				to={href}
				className="block hover:bg-accent rounded-md px-3 -mx-3 py-1 transition-colors"
				aria-label={`View content: ${item.title ? toPlainText(item.title) : "content"}`}
			>
				{content}
			</Link>
		);
	}

	return <div className="px-3 -mx-3 py-1">{content}</div>;
}
