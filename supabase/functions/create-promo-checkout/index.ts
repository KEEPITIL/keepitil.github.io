// KEEPITIL — Supabase Edge Function: create-promo-checkout
// Sells an organizer a PAID promotional service. Payment goes 100% to KEEPITIL
// (no Connect transfer, no application fee) — our margin is baked into the price,
// which the Founder edits in promo_services. Returns the hosted checkout URL.
// Secrets: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import Stripe from "https://esm.sh/stripe@14?target=deno&no-check";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
// ⚠ WAS "https://keepitil.com/v3" (route cleanup 2026-08-31). Every organizer who PAID for a
// promo was sent to https://keepitil.com/v3/campaigns.html?e=…&promo=paid immediately after
// checkout — /v3 has 404'd since the purge, and /campaigns.html has never existed at any path,
// so the post-payment landing was doubly dead. The same defect was fixed in create-checkout
// (v41) and connect-onboard; this function was missed because nothing links to it from the
// pages that were being audited.
const SITE = "https://keepitil.com";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return new Response(JSON.stringify({ error: "not signed in" }), { status: 401, headers: cors });
    const { data: me } = await admin.from("app_users").select("handle").eq("id", u.user.id).maybeSingle();
    if (!me?.handle) return new Response(JSON.stringify({ error: "no profile" }), { status: 400, headers: cors });

    const { event_slug, service_key } = await req.json();
    const { data: svc } = await admin.from("promo_services").select("*").eq("key", service_key).maybeSingle();
    if (!svc || !svc.active) return new Response(JSON.stringify({ error: "service unavailable" }), { status: 404, headers: cors });
    if (svc.tier !== "paid") return new Response(JSON.stringify({ error: "that service is free — no checkout needed" }), { status: 400, headers: cors });
    if (svc.price_cents < 100) return new Response(JSON.stringify({ error: "price not set" }), { status: 400, headers: cors });

    const { data: ev } = await admin.from("events").select("id,slug,title,owner_handle").eq("slug", event_slug).maybeSingle();
    if (!ev) return new Response(JSON.stringify({ error: "event not found" }), { status: 404, headers: cors });
    if (ev.owner_handle !== me.handle) return new Response(JSON.stringify({ error: "not your event" }), { status: 403, headers: cors });

    const { data: order } = await admin.from("promo_orders").insert({
      event_id: ev.id, event_slug: ev.slug, owner_handle: me.handle,
      service_key: svc.key, service_name: svc.name, price_cents: svc.price_cents, status: "pending",
    }).select("id").single();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: svc.price_cents,
          product_data: { name: `${svc.name} — ${ev.title}`, description: svc.description || undefined },
        },
      }],
      metadata: { promo_order_id: order?.id || "", service_key: svc.key, event_id: String(ev.id) },
      payment_intent_data: { metadata: { promo_order_id: order?.id || "", service_key: svc.key, event_id: String(ev.id) } },
      // The event page is the real surface the promo acts on, and it exists — the same
      // destination create-checkout uses for a ticket purchase.
      success_url: `${SITE}/event.html?e=${ev.slug}&promo=paid`,
      cancel_url: `${SITE}/event.html?e=${ev.slug}&promo=cancel`,
    });

    if (order?.id) await admin.from("promo_orders").update({ stripe_session_id: session.id }).eq("id", order.id);
    return new Response(JSON.stringify({ url: session.url }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
