/**
 * Starter flow templates.
 *
 * Three pre-canned flows users can clone with one click instead of
 * building from scratch. Each template is a plain JS object describing
 * the same shape `/api/flows` PUT accepts — name, trigger config,
 * entry_node_id, fallback_policy, nodes[] — keyed by a stable
 * `slug`.
 *
 * The clone path (`/api/flows` POST with `template_slug`) creates a
 * NEW flow_row + flow_nodes rows for the user. `node_key`s are kept
 * verbatim (they're stable strings, not UUIDs, so cloning never
 * needs to rewrite edge references).
 *
 * Choosing a single static module over a DB-backed gallery for v1
 * because: (a) the set is small and changes with code releases, not
 * data; (b) keeps templates portable across self-hosted instances
 * without migrations; (c) editing in source is the lowest-friction
 * way to add the next template.
 */

import type {
  CollectInputNodeConfig,
  ConditionNodeConfig,
  HandoffNodeConfig,
  KeywordTriggerConfig,
  SendButtonsNodeConfig,
  SendListNodeConfig,
  SendMessageNodeConfig,
  StartNodeConfig,
} from "./types";

export type FlowTemplateNodeType =
  | "start"
  | "send_message"
  | "send_buttons"
  | "send_list"
  | "collect_input"
  | "condition"
  | "set_tag"
  | "handoff"
  | "end";

export interface FlowTemplateNode {
  node_key: string;
  node_type: FlowTemplateNodeType;
  config:
    | StartNodeConfig
    | SendMessageNodeConfig
    | SendButtonsNodeConfig
    | SendListNodeConfig
    | CollectInputNodeConfig
    | ConditionNodeConfig
    | HandoffNodeConfig
    | Record<string, unknown>;
}

export interface FlowTemplate {
  slug: string;
  name: string;
  description: string;
  /** Used by the gallery to surface a relevant icon. lucide-react name. */
  icon:
    | "MessageSquare"
    | "HelpCircle"
    | "UserPlus"
    | "ClipboardList"
    | "CalendarCheck"
    | "FileSearch"
    | "Star"
    | "Sparkles"
    | "ListTodo"
    | "Calculator"
    | "GraduationCap"
    | "Compass"
    | "Award";
  trigger_type: "keyword" | "first_inbound_message" | "manual";
  trigger_config: KeywordTriggerConfig | Record<string, unknown>;
  entry_node_id: string;
  nodes: FlowTemplateNode[];
}

// ============================================================
// 1. Welcome menu — the example from the owner's brief
// ============================================================
const WELCOME_MENU: FlowTemplate = {
  slug: "welcome_menu",
  name: "Welcome menu",
  description:
    "Greet customers who type a keyword and route them to the right agent based on whether they're new or existing.",
  icon: "MessageSquare",
  trigger_type: "keyword",
  trigger_config: { keywords: ["support", "help", "hi"], match_type: "contains" },
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "welcome" },
    },
    {
      node_key: "welcome",
      node_type: "send_buttons",
      config: {
        text: "Hi! 👋 Welcome to support. Are you an existing customer or new here?",
        footer_text: "Tap a button below to continue.",
        buttons: [
          {
            reply_id: "existing",
            title: "Existing customer",
            next_node_key: "existing_handoff",
          },
          {
            reply_id: "new",
            title: "New customer",
            next_node_key: "new_handoff",
          },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "existing_handoff",
      node_type: "handoff",
      config: {
        note: "Existing customer needs assistance — please check account history before replying.",
      } as HandoffNodeConfig,
    },
    {
      node_key: "new_handoff",
      node_type: "handoff",
      config: {
        note: "New customer — share pricing + onboarding link.",
      } as HandoffNodeConfig,
    },
  ],
};

// ============================================================
// 2. FAQ bot — list-message answers, fully automated
// ============================================================
const FAQ_BOT: FlowTemplate = {
  slug: "faq_bot",
  name: "FAQ bot",
  description:
    "Answer common questions automatically. Customer picks a topic from a list; the bot replies with the answer and ends.",
  icon: "HelpCircle",
  trigger_type: "keyword",
  trigger_config: {
    keywords: ["faq", "question", "info"],
    match_type: "contains",
  },
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "topics" },
    },
    {
      node_key: "topics",
      node_type: "send_list",
      config: {
        text: "What can I help you with?",
        button_label: "View topics",
        sections: [
          {
            title: "Common questions",
            rows: [
              {
                reply_id: "hours",
                title: "Opening hours",
                next_node_key: "answer_hours",
              },
              {
                reply_id: "pricing",
                title: "Pricing",
                next_node_key: "answer_pricing",
              },
              {
                reply_id: "refunds",
                title: "Refund policy",
                next_node_key: "answer_refunds",
              },
            ],
          },
          {
            title: "Other",
            rows: [
              {
                reply_id: "human",
                title: "Talk to a human",
                next_node_key: "human_handoff",
              },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    {
      node_key: "answer_hours",
      node_type: "send_message",
      config: {
        text: "We're open Mon–Fri, 9am–6pm local time. Weekend support is limited to urgent issues.",
        next_node_key: "end",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "answer_pricing",
      node_type: "send_message",
      config: {
        text: "Our pricing starts at $9/mo. Visit https://example.com/pricing for the full breakdown.",
        next_node_key: "end",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "answer_refunds",
      node_type: "send_message",
      config: {
        text: "Refunds are honored within 30 days of purchase. Reply with your order number and we'll process it.",
        next_node_key: "end",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "human_handoff",
      node_type: "handoff",
      config: {
        note: "Customer asked to talk to a human from the FAQ bot.",
      } as HandoffNodeConfig,
    },
    {
      node_key: "end",
      node_type: "end",
      config: {},
    },
  ],
};

// ============================================================
// 3. Lead capture — collect_input chain, ends in a handoff
// ============================================================
const LEAD_CAPTURE: FlowTemplate = {
  slug: "lead_capture",
  name: "Lead capture",
  description:
    "Greet first-time inbounds, capture name + email + company, then hand off to sales with the answers in the note.",
  icon: "UserPlus",
  trigger_type: "first_inbound_message",
  trigger_config: {},
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "intro" },
    },
    {
      node_key: "intro",
      node_type: "send_message",
      config: {
        text: "Welcome! 👋 I'll ask a few quick questions so we can get you to the right person.",
        next_node_key: "ask_name",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "ask_name",
      node_type: "collect_input",
      config: {
        prompt_text: "What's your name?",
        var_key: "name",
        next_node_key: "ask_email",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_email",
      node_type: "collect_input",
      config: {
        prompt_text: "Thanks {{vars.name}}! What's your work email?",
        var_key: "email",
        next_node_key: "ask_company",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_company",
      node_type: "collect_input",
      config: {
        prompt_text: "Almost done — what's your company name?",
        var_key: "company",
        next_node_key: "handoff",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "handoff",
      node_type: "handoff",
      config: {
        note: "New lead — name={{vars.name}}, email={{vars.email}}, company={{vars.company}}.",
      } as HandoffNodeConfig,
    },
  ],
};

// ============================================================
// 4. Service intake & qualification
// ============================================================
const SERVICE_INTAKE: FlowTemplate = {
  slug: "service_intake",
  name: "Service intake & qualification",
  description:
    "Qualify inbound service inquiries by collecting requirements, budget, and timeline — then route hot leads to an agent.",
  icon: "ClipboardList",
  trigger_type: "keyword",
  trigger_config: { keywords: ["services", "pricing", "quote", "inquiry"], match_type: "contains" },
  entry_node_id: "start",
  nodes: [
    { node_key: "start", node_type: "start", config: { next_node_key: "welcome" } },
    {
      node_key: "welcome",
      node_type: "send_message",
      config: {
        text: "Hi there! 👋 Thanks for reaching out. Let me help you find the right service.",
        next_node_key: "ask_service",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "ask_service",
      node_type: "send_buttons",
      config: {
        text: "What are you looking for?",
        footer_text: "Tap the option that best describes your need.",
        buttons: [
          { reply_id: "consulting", title: "Consulting", next_node_key: "ask_budget" },
          { reply_id: "implementation", title: "Implementation", next_node_key: "ask_budget" },
          { reply_id: "other", title: "Something else", next_node_key: "ask_details" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "ask_budget",
      node_type: "collect_input",
      config: {
        prompt_text: "What's your approximate budget range for this project?",
        var_key: "budget",
        next_node_key: "ask_timeline",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_timeline",
      node_type: "send_buttons",
      config: {
        text: "When do you need to get started?",
        buttons: [
          { reply_id: "asap", title: "ASAP", next_node_key: "hot_handoff" },
          { reply_id: "1month", title: "Within 1 month", next_node_key: "warm_handoff" },
          { reply_id: "exploring", title: "Just exploring", next_node_key: "nurture_msg" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "ask_details",
      node_type: "collect_input",
      config: {
        prompt_text: "Sure! Tell us a bit more about what you need — we'll connect you with the right person.",
        var_key: "details",
        next_node_key: "general_handoff",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "hot_handoff",
      node_type: "handoff",
      config: {
        note: "🔥 Hot lead — wants to start ASAP. Budget: {{vars.budget}}. Service: tapped button.",
      } as HandoffNodeConfig,
    },
    {
      node_key: "warm_handoff",
      node_type: "handoff",
      config: {
        note: "Warm lead — 1 month timeline. Budget: {{vars.budget}}. Service: tapped button.",
      } as HandoffNodeConfig,
    },
    {
      node_key: "nurture_msg",
      node_type: "send_message",
      config: {
        text: "No rush! 🙂 We'll send you some resources to help with your research. Feel free to reach out anytime.",
        next_node_key: "end",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "general_handoff",
      node_type: "handoff",
      config: {
        note: "Custom inquiry — Details: {{vars.details}}. Needs human review.",
      } as HandoffNodeConfig,
    },
    { node_key: "end", node_type: "end", config: {} },
  ],
};

// ============================================================
// 5. Consultation booking
// ============================================================
const APPOINTMENT_BOOKING: FlowTemplate = {
  slug: "appointment_booking",
  name: "Consultation booking",
  description:
    "Collect name, consultation type, and preferred time — then hand off for scheduling confirmation.",
  icon: "CalendarCheck",
  trigger_type: "keyword",
  trigger_config: { keywords: ["appointment", "book", "consultation", "schedule", "meeting"], match_type: "contains" },
  entry_node_id: "start",
  nodes: [
    { node_key: "start", node_type: "start", config: { next_node_key: "welcome" } },
    {
      node_key: "welcome",
      node_type: "send_message",
      config: {
        text: "Hi! 📅 Let's get you booked for a consultation. Just a few quick questions.",
        next_node_key: "ask_name",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "ask_name",
      node_type: "collect_input",
      config: { prompt_text: "What's your full name?", var_key: "name", next_node_key: "ask_type" } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_type",
      node_type: "send_buttons",
      config: {
        text: "Thanks {{vars.name}}! What type of consultation?",
        buttons: [
          { reply_id: "first_time", title: "First-time consult", next_node_key: "ask_time" },
          { reply_id: "followup", title: "Follow-up", next_node_key: "ask_time" },
          { reply_id: "urgent", title: "Urgent matter", next_node_key: "urgent_handoff" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "ask_time",
      node_type: "collect_input",
      config: {
        prompt_text: "When works best for you? (e.g. \"Mon 2pm\", \"any weekday morning\")",
        var_key: "preferred_time",
        next_node_key: "confirm",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "confirm",
      node_type: "send_message",
      config: {
        text: "Great! Here's what I have:\n👤 {{vars.name}}\n📅 Preferred: {{vars.preferred_time}}\n\nWe'll confirm your slot shortly. 🎯",
        next_node_key: "booking_handoff",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "urgent_handoff",
      node_type: "handoff",
      config: {
        note: "⚠️ URGENT consultation — {{vars.name}} needs immediate attention.",
      } as HandoffNodeConfig,
    },
    {
      node_key: "booking_handoff",
      node_type: "handoff",
      config: {
        note: "Booking request — Name: {{vars.name}}, Preferred: {{vars.preferred_time}}, Type: tapped button.",
      } as HandoffNodeConfig,
    },
  ],
};

// ============================================================
// 6. Document collection
// ============================================================
const DOCUMENT_COLLECTOR: FlowTemplate = {
  slug: "document_collector",
  name: "Document collection",
  description:
    "Guide clients through submitting required documents one-by-one. Acknowledges each upload and hands off for review.",
  icon: "FileSearch",
  trigger_type: "keyword",
  trigger_config: { keywords: ["documents", "upload", "submit", "files"], match_type: "contains" },
  entry_node_id: "start",
  nodes: [
    { node_key: "start", node_type: "start", config: { next_node_key: "welcome" } },
    {
      node_key: "welcome",
      node_type: "send_message",
      config: {
        text: "Hi! 📋 Let's collect your documents. I'll guide you through each one.",
        next_node_key: "ask_id",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "ask_id",
      node_type: "collect_input",
      config: {
        prompt_text: "Please send your *ID document* (passport, driver's license, or national ID) as a photo or PDF.",
        var_key: "id_doc",
        next_node_key: "ack_id",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "ack_id",
      node_type: "send_message",
      config: { text: "✅ ID received! One more to go...", next_node_key: "ask_proof" } as SendMessageNodeConfig,
    },
    {
      node_key: "ask_proof",
      node_type: "collect_input",
      config: {
        prompt_text: "Now please send your *proof of address* (utility bill, bank statement, or lease agreement).",
        var_key: "proof_doc",
        next_node_key: "ack_proof",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "ack_proof",
      node_type: "send_message",
      config: { text: "✅ Address proof received!", next_node_key: "ask_more" } as SendMessageNodeConfig,
    },
    {
      node_key: "ask_more",
      node_type: "send_buttons",
      config: {
        text: "Do you have any additional documents to submit?",
        buttons: [
          { reply_id: "more", title: "I have more", next_node_key: "ask_extra" },
          { reply_id: "done", title: "That's everything", next_node_key: "complete" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "ask_extra",
      node_type: "collect_input",
      config: {
        prompt_text: "Go ahead — send any additional documents now.",
        var_key: "extra_docs",
        next_node_key: "review_handoff",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "complete",
      node_type: "send_message",
      config: {
        text: "🎉 All documents received! Our team will review them and get back to you within 24 hours.",
        next_node_key: "review_handoff",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "review_handoff",
      node_type: "handoff",
      config: { note: "Document collection complete. ID + proof of address submitted. Ready for agent review." } as HandoffNodeConfig,
    },
  ],
};

// ============================================================
// 7. Post-service feedback
// ============================================================
const FEEDBACK_SURVEY: FlowTemplate = {
  slug: "feedback_survey",
  name: "Post-service feedback",
  description:
    "Collect satisfaction rating and feedback after service completion. Routes unhappy customers to a recovery agent.",
  icon: "Star",
  trigger_type: "manual",
  trigger_config: {},
  entry_node_id: "start",
  nodes: [
    { node_key: "start", node_type: "start", config: { next_node_key: "greeting" } },
    {
      node_key: "greeting",
      node_type: "send_message",
      config: {
        text: "Hi! 👋 We'd love to hear about your recent experience with us.",
        next_node_key: "ask_rating",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "ask_rating",
      node_type: "send_buttons",
      config: {
        text: "How would you rate our service?",
        buttons: [
          { reply_id: "great", title: "⭐ Great!", next_node_key: "ask_testimonial" },
          { reply_id: "okay", title: "😐 Okay", next_node_key: "ask_improvement" },
          { reply_id: "poor", title: "👎 Poor", next_node_key: "ask_issue" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "ask_testimonial",
      node_type: "collect_input",
      config: {
        prompt_text: "Amazing! 🎉 Would you mind sharing what you liked most?",
        var_key: "testimonial",
        next_node_key: "thank_positive",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "thank_positive",
      node_type: "send_message",
      config: { text: "Thank you so much! 🙏 Your feedback means the world to us.", next_node_key: "end" } as SendMessageNodeConfig,
    },
    {
      node_key: "ask_improvement",
      node_type: "collect_input",
      config: {
        prompt_text: "Thanks for the honest feedback. What could we improve?",
        var_key: "improvement",
        next_node_key: "thank_neutral",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "thank_neutral",
      node_type: "send_message",
      config: { text: "We appreciate your input and will work on improving. Thank you! 🙏", next_node_key: "end" } as SendMessageNodeConfig,
    },
    {
      node_key: "ask_issue",
      node_type: "collect_input",
      config: {
        prompt_text: "We're really sorry. 😔 Please tell us what went wrong — we want to make it right.",
        var_key: "issue",
        next_node_key: "recovery_handoff",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "recovery_handoff",
      node_type: "handoff",
      config: {
        note: "⚠️ UNHAPPY CUSTOMER — Issue: {{vars.issue}}. Needs immediate recovery call.",
      } as HandoffNodeConfig,
    },
    { node_key: "end", node_type: "end", config: {} },
  ],
};

// ============================================================
// 8. Product / service recommender
// ============================================================
const PRODUCT_RECOMMENDER: FlowTemplate = {
  slug: "product_recommender",
  name: "Product / service recommender",
  description:
    "Ask 3 preference questions via buttons and lists, then recommend the best fit and offer to connect with sales.",
  icon: "Sparkles",
  trigger_type: "keyword",
  trigger_config: { keywords: ["recommend", "suggest", "help me choose", "which", "best"], match_type: "contains" },
  entry_node_id: "start",
  nodes: [
    { node_key: "start", node_type: "start", config: { next_node_key: "welcome" } },
    {
      node_key: "welcome",
      node_type: "send_message",
      config: {
        text: "Hey! 🎯 Let me help you find the perfect fit. Just 3 quick questions!",
        next_node_key: "ask_need",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "ask_need",
      node_type: "send_list",
      config: {
        text: "What's your primary goal?",
        button_label: "View options",
        sections: [
          {
            title: "Choose your goal",
            rows: [
              { reply_id: "grow", title: "Grow my business", description: "Scale, expand, increase revenue", next_node_key: "ask_size" },
              { reply_id: "save", title: "Save time or money", description: "Automate, optimize, reduce costs", next_node_key: "ask_size" },
              { reply_id: "start", title: "Start something new", description: "Launch, build, create from scratch", next_node_key: "ask_size" },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    {
      node_key: "ask_size",
      node_type: "send_buttons",
      config: {
        text: "How big is your team?",
        buttons: [
          { reply_id: "solo", title: "Just me", next_node_key: "ask_budget" },
          { reply_id: "small", title: "Small team (2-10)", next_node_key: "ask_budget" },
          { reply_id: "large", title: "Larger team (10+)", next_node_key: "ask_budget" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "ask_budget",
      node_type: "send_buttons",
      config: {
        text: "What's your monthly budget range?",
        buttons: [
          { reply_id: "low", title: "Under $500/mo", next_node_key: "rec_starter" },
          { reply_id: "mid", title: "$500-2000/mo", next_node_key: "rec_pro" },
          { reply_id: "high", title: "$2000+/mo", next_node_key: "rec_pro" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "rec_starter",
      node_type: "send_message",
      config: {
        text: "Based on your needs, our *Starter* plan is a great fit! 🚀 It includes everything you need to get going.",
        next_node_key: "offer_next",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "rec_pro",
      node_type: "send_message",
      config: {
        text: "Our *Pro* plan with dedicated support would be ideal for you! 💎 Let me connect you with someone who can walk you through it.",
        next_node_key: "offer_next",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "offer_next",
      node_type: "send_buttons",
      config: {
        text: "What would you like to do next?",
        buttons: [
          { reply_id: "demo", title: "Book a demo", next_node_key: "demo_handoff" },
          { reply_id: "details", title: "Send me details", next_node_key: "details_msg" },
          { reply_id: "questions", title: "I have questions", next_node_key: "questions_handoff" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "demo_handoff",
      node_type: "handoff",
      config: { note: "Demo request — Goal: list selection, Team size: button, Budget: button." } as HandoffNodeConfig,
    },
    {
      node_key: "details_msg",
      node_type: "send_message",
      config: {
        text: "We'll send you a personalized summary shortly! 📩 Feel free to reach out anytime.",
        next_node_key: "end",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "questions_handoff",
      node_type: "handoff",
      config: { note: "Has questions — Goal: list selection, Team size: button, Budget: button." } as HandoffNodeConfig,
    },
    { node_key: "end", node_type: "end", config: {} },
  ],
};

// ============================================================
// 9. New client onboarding
// ============================================================
const ONBOARDING_CHECKLIST: FlowTemplate = {
  slug: "onboarding_checklist",
  name: "New client onboarding",
  description:
    "Walk new clients through onboarding — collect key info, confirm details, and set expectations for next steps.",
  icon: "ListTodo",
  trigger_type: "manual",
  trigger_config: {},
  entry_node_id: "start",
  nodes: [
    { node_key: "start", node_type: "start", config: { next_node_key: "welcome" } },
    {
      node_key: "welcome",
      node_type: "send_message",
      config: {
        text: "Welcome aboard! 🎉 Let's get you set up. This takes about 2 minutes.",
        next_node_key: "ask_company",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "ask_company",
      node_type: "collect_input",
      config: {
        prompt_text: "First — what's your company or organization name?",
        var_key: "company",
        next_node_key: "ask_poc",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_poc",
      node_type: "collect_input",
      config: {
        prompt_text: "Who should be our primary point of contact? (Name + role)",
        var_key: "poc",
        next_node_key: "ask_goal",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_goal",
      node_type: "collect_input",
      config: {
        prompt_text: "What's the #1 thing you want to achieve with us?",
        var_key: "goal",
        next_node_key: "confirm",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "confirm",
      node_type: "send_buttons",
      config: {
        text: "Here's what I have:\n📌 Company: {{vars.company}}\n👤 Contact: {{vars.poc}}\n🎯 Goal: {{vars.goal}}\n\nIs this correct?",
        buttons: [
          { reply_id: "correct", title: "Yes, all correct!", next_node_key: "next_steps" },
          { reply_id: "change", title: "I need to change", next_node_key: "edit_handoff" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "next_steps",
      node_type: "send_message",
      config: {
        text: "You're all set! 🚀 Here's what happens next:\n\n1️⃣ Your account manager will reach out within 24h\n2️⃣ We'll schedule a kickoff call\n3️⃣ You'll get access to your dashboard\n\nQuestions? Just reply here anytime!",
        next_node_key: "onboard_handoff",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "onboard_handoff",
      node_type: "handoff",
      config: {
        note: "Onboarding complete — Company: {{vars.company}}, POC: {{vars.poc}}, Goal: {{vars.goal}}.",
      } as HandoffNodeConfig,
    },
    {
      node_key: "edit_handoff",
      node_type: "handoff",
      config: {
        note: "Client wants to edit onboarding details — Company: {{vars.company}}, POC: {{vars.poc}}, Goal: {{vars.goal}}.",
      } as HandoffNodeConfig,
    },
  ],
};

// ============================================================
// 10. Canada Express Entry CRS Calculator
// ============================================================
const CANADA_CRS_CALCULATOR: FlowTemplate = {
  slug: "canada_crs_calculator",
  name: "Canada Express Entry CRS Calculator",
  description:
    "Interactive quiz calculating Express Entry CRS points based on Age, Education, IELTS CLB, and Experience with immediate tier recommendation.",
  icon: "Calculator",
  trigger_type: "keyword",
  trigger_config: {
    keywords: ["crs", "canada", "express entry", "points", "pr"],
    match_type: "contains",
  },
  entry_node_id: "start",
  nodes: [
    { node_key: "start", node_type: "start", config: { next_node_key: "welcome" } },
    {
      node_key: "welcome",
      node_type: "send_buttons",
      config: {
        text: "🍁 *Welcome to the Canada Express Entry CRS Assessment!*\n\nFind out your estimated immigration score and pathway eligibility in under 2 minutes.",
        buttons: [
          { reply_id: "start_calc", title: "Start Assessment", next_node_key: "ask_age" },
          { reply_id: "talk_agent", title: "Talk to Counselor", next_node_key: "counselor_handoff" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "ask_age",
      node_type: "send_buttons",
      config: {
        text: "1️⃣ *What is your age bracket?*\n\nAge accounts for up to 110 CRS points.",
        buttons: [
          { reply_id: "age_young", title: "18-29 yrs (110 pts)", next_node_key: "ask_edu" },
          { reply_id: "age_mid", title: "30-39 yrs (75-95)", next_node_key: "ask_edu" },
          { reply_id: "age_senior", title: "40+ yrs (0-35 pts)", next_node_key: "ask_edu" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "ask_edu",
      node_type: "send_list",
      config: {
        text: "2️⃣ *What is your highest completed education level?*",
        button_label: "Select Education",
        sections: [
          {
            title: "Post-Secondary Qualifications",
            rows: [
              { reply_id: "phd", title: "PhD / Doctorate", description: "150 points", next_node_key: "ask_lang" },
              { reply_id: "masters", title: "Master's / Professional", description: "135 points", next_node_key: "ask_lang" },
              { reply_id: "bachelors", title: "Bachelor's (3+ yrs)", description: "120 points", next_node_key: "ask_lang" },
              { reply_id: "diploma", title: "2-Year Diploma / Trade", description: "98 points", next_node_key: "ask_lang" },
              { reply_id: "secondary", title: "Secondary / High School", description: "30 points", next_node_key: "ask_lang" },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    {
      node_key: "ask_lang",
      node_type: "send_buttons",
      config: {
        text: "3️⃣ *What is your estimated English proficiency level (IELTS / CELPIP)?*",
        footer_text: "CLB 9 is IELTS: L:8, R:7, W:7, S:7",
        buttons: [
          { reply_id: "clb_high", title: "CLB 9+ (124-136)", next_node_key: "ask_exp" },
          { reply_id: "clb_mid", title: "CLB 7-8 (68-92)", next_node_key: "ask_exp" },
          { reply_id: "clb_low", title: "Below CLB 7 (0 pts)", next_node_key: "ask_exp" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "ask_exp",
      node_type: "send_buttons",
      config: {
        text: "4️⃣ *How many years of continuous skilled work experience do you have?*",
        buttons: [
          { reply_id: "exp_high", title: "3+ Years (50 pts)", next_node_key: "score_outcome" },
          { reply_id: "exp_mid", title: "1-2 Years (25 pts)", next_node_key: "score_outcome" },
          { reply_id: "exp_low", title: "Less than 1 Year", next_node_key: "score_outcome" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "score_outcome",
      node_type: "send_buttons",
      config: {
        text: "✅ *Assessment Completed!*\n\nBased on your selections, we're generating your tailored CRS scorecard and customized immigration roadmap.\n\nHow would you like to proceed?",
        buttons: [
          { reply_id: "book_eval", title: "Book Consultation", next_node_key: "consultation_handoff" },
          { reply_id: "checklist", title: "Get Document List", next_node_key: "docs_msg" },
          { reply_id: "pnp_info", title: "Explore PNP Options", next_node_key: "pnp_msg" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "consultation_handoff",
      node_type: "handoff",
      config: {
        note: "CRS Calculator Lead — Applicant completed Canada Express Entry assessment and requested consultation.",
      } as HandoffNodeConfig,
    },
    {
      node_key: "docs_msg",
      node_type: "send_message",
      config: {
        text: "📄 *Standard Documents for Express Entry:*\n• Valid Passport\n• WES / ICAS Educational Credential Assessment (ECA)\n• IELTS General Training or CELPIP Scorecard\n• Reference letters from employers with NOC match\n\nOur team will contact you shortly to review your profile!",
        next_node_key: "end",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "pnp_msg",
      node_type: "send_message",
      config: {
        text: "🍁 *Provincial Nominee Programs (PNP):*\nIf your CRS score needs a boost, PNP nominations (OINP, BC PNP, SINP, AAIP) grant +600 points, guaranteeing an Invitation to Apply (ITA)!\n\nA counselor will message you with eligible streams.",
        next_node_key: "end",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "counselor_handoff",
      node_type: "handoff",
      config: {
        note: "Customer requested direct assistance from immigration counselor.",
      } as HandoffNodeConfig,
    },
    { node_key: "end", node_type: "end", config: {} },
  ],
};

// ============================================================
// 11. Australia Skilled Migration Points Test
// ============================================================
const AUSTRALIA_POINTS_TEST: FlowTemplate = {
  slug: "australia_points_test",
  name: "Australia Skilled Migration Points Test",
  description:
    "Assess eligibility for Australia Subclass 189, 190, and 491 visas against the official 65-point pass mark.",
  icon: "Compass",
  trigger_type: "keyword",
  trigger_config: {
    keywords: ["australia", "189", "190", "pr points", "skillselect"],
    match_type: "contains",
  },
  entry_node_id: "start",
  nodes: [
    { node_key: "start", node_type: "start", config: { next_node_key: "welcome" } },
    {
      node_key: "welcome",
      node_type: "send_buttons",
      config: {
        text: "🦘 *Australia Skilled Migration Points Test (Subclass 189 / 190)*\n\nThe pass mark is 65 points. Let's check if your profile meets the threshold in 4 quick questions!",
        buttons: [
          { reply_id: "start_aus", title: "Start Test", next_node_key: "aus_age" },
          { reply_id: "ask_agent", title: "Speak to Agent", next_node_key: "aus_handoff" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "aus_age",
      node_type: "send_buttons",
      config: {
        text: "1️⃣ *What is your age bracket?*",
        buttons: [
          { reply_id: "age_25_32", title: "25-32 yrs (30 pts)", next_node_key: "aus_eng" },
          { reply_id: "age_18_24_33_39", title: "18-24/33-39 (25 pts)", next_node_key: "aus_eng" },
          { reply_id: "age_40_44", title: "40-44 yrs (15 pts)", next_node_key: "aus_eng" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "aus_eng",
      node_type: "send_buttons",
      config: {
        text: "2️⃣ *What is your English proficiency level (IELTS / PTE)?*",
        buttons: [
          { reply_id: "eng_superior", title: "Superior / PTE 79+", next_node_key: "aus_qual" },
          { reply_id: "eng_proficient", title: "Proficient / PTE 65+", next_node_key: "aus_qual" },
          { reply_id: "eng_competent", title: "Competent / PTE 50+", next_node_key: "aus_qual" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "aus_qual",
      node_type: "send_buttons",
      config: {
        text: "3️⃣ *What is your highest educational qualification?*",
        buttons: [
          { reply_id: "qual_doc", title: "Doctorate (20 pts)", next_node_key: "aus_exp" },
          { reply_id: "qual_bach_mast", title: "Bachelor/Master (15)", next_node_key: "aus_exp" },
          { reply_id: "qual_trade", title: "Diploma/Trade (10)", next_node_key: "aus_exp" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "aus_exp",
      node_type: "send_buttons",
      config: {
        text: "4️⃣ *Overseas skilled employment experience in your nominated occupation:*",
        buttons: [
          { reply_id: "exp_8_plus", title: "8+ Years (15 pts)", next_node_key: "aus_result" },
          { reply_id: "exp_5_7", title: "5-7 Years (10 pts)", next_node_key: "aus_result" },
          { reply_id: "exp_3_4", title: "3-4 Years (5 pts)", next_node_key: "aus_result" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "aus_result",
      node_type: "send_message",
      config: {
        text: "🎉 *Assessment Complete!*\n\nOur MARA-registered migration agents will evaluate your Points Test result and provide an occupation list (MLTSSL / STSOL) analysis.\n\nReply to this message with your CV or resume to begin your Skills Assessment!",
        next_node_key: "aus_handoff",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "aus_handoff",
      node_type: "handoff",
      config: {
        note: "Australia Points Test completed — follow up for Skills Assessment and EOI submission.",
      } as HandoffNodeConfig,
    },
    { node_key: "end", node_type: "end", config: {} },
  ],
};

// ============================================================
// 12. UK Skilled Worker & Visa Eligibility
// ============================================================
const UK_VISA_ELIGIBILITY: FlowTemplate = {
  slug: "uk_visa_eligibility",
  name: "UK Skilled Worker & Visa Eligibility",
  description:
    "Interactive quiz verifying job offer/sponsorship, salary threshold (£38,700), and English B1/B2 level.",
  icon: "GraduationCap",
  trigger_type: "keyword",
  trigger_config: {
    keywords: ["uk", "skilled worker", "student visa", "tier 4", "cos"],
    match_type: "contains",
  },
  entry_node_id: "start",
  nodes: [
    { node_key: "start", node_type: "start", config: { next_node_key: "welcome" } },
    {
      node_key: "welcome",
      node_type: "send_buttons",
      config: {
        text: "🇬🇧 *UK Visa Eligibility Checker*\n\nWhich UK immigration pathway are you interested in?",
        buttons: [
          { reply_id: "skilled_worker", title: "Skilled Worker Visa", next_node_key: "uk_job" },
          { reply_id: "student_visa", title: "Student Route Visa", next_node_key: "uk_student" },
          { reply_id: "other_visa", title: "Other / Visitor", next_node_key: "uk_handoff" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "uk_job",
      node_type: "send_buttons",
      config: {
        text: "1️⃣ *Do you have a Certificate of Sponsorship (CoS) from a licensed UK employer?*",
        buttons: [
          { reply_id: "has_cos", title: "Yes, I have CoS", next_node_key: "uk_salary" },
          { reply_id: "seeking_cos", title: "Looking for Sponsor", next_node_key: "uk_sponsor_advice" },
          { reply_id: "not_sure", title: "Not sure", next_node_key: "uk_salary" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "uk_salary",
      node_type: "send_buttons",
      config: {
        text: "2️⃣ *Does the proposed job offer meet the general salary threshold (minimum £38,700 or going rate)?*",
        buttons: [
          { reply_id: "salary_above", title: "Yes, ≥ £38,700", next_node_key: "uk_english" },
          { reply_id: "salary_discount", title: "New Entrant / PhD", next_node_key: "uk_english" },
          { reply_id: "salary_below", title: "Under £38,700", next_node_key: "uk_english" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "uk_english",
      node_type: "send_buttons",
      config: {
        text: "3️⃣ *Do you meet the English language requirement (SELT Level B1 in reading, writing, speaking, listening)?*",
        buttons: [
          { reply_id: "eng_yes", title: "Yes, Passed SELT", next_node_key: "uk_summary" },
          { reply_id: "eng_exempt", title: "UK Degree / Exempt", next_node_key: "uk_summary" },
          { reply_id: "eng_need_test", title: "Need to take test", next_node_key: "uk_summary" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "uk_sponsor_advice",
      node_type: "send_message",
      config: {
        text: "💡 *Sponsorship Guidance:*\nTo qualify for a UK Skilled Worker Visa, you must receive an official job offer and Certificate of Sponsorship (CoS) from a Home Office approved sponsor.\n\nOur recruitment & compliance team can guide you on verified shortage roles.",
        next_node_key: "uk_summary",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "uk_student",
      node_type: "send_buttons",
      config: {
        text: "🎓 *UK Student Visa:*\nHave you received an unconditional offer and Confirmation of Acceptance for Studies (CAS) from a licensed UK university?",
        buttons: [
          { reply_id: "has_cas", title: "Yes, I have CAS", next_node_key: "uk_summary" },
          { reply_id: "seeking_admissions", title: "Need University Help", next_node_key: "uk_summary" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "uk_summary",
      node_type: "send_buttons",
      config: {
        text: "📋 *UK Assessment Ready!*\n\nWould you like a senior UK immigration counselor to review your case documents?",
        buttons: [
          { reply_id: "talk_uk", title: "Connect to Counselor", next_node_key: "uk_handoff" },
          { reply_id: "fees_info", title: "Check UK Visa Fees", next_node_key: "uk_fees" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "uk_fees",
      node_type: "send_message",
      config: {
        text: "💰 *Standard UK Visa Costs:*\n• Visa Application: £719–£1,500\n• Immigration Health Surcharge (IHS): £1,035/year\n• Financial Maintenance: ~£1,023–£1,334/month living funds\n\nAn advisor will connect with you shortly!",
        next_node_key: "uk_handoff",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "uk_handoff",
      node_type: "handoff",
      config: {
        note: "UK Visa lead — Applicant completed UK qualification flow.",
      } as HandoffNodeConfig,
    },
    { node_key: "end", node_type: "end", config: {} },
  ],
};

// ============================================================
// 13. Universal BANT Lead Qualification
// ============================================================
const UNIVERSAL_LEAD_SCORING: FlowTemplate = {
  slug: "universal_lead_scoring",
  name: "Universal BANT Lead Qualification",
  description:
    "4-step BANT lead scoring quiz for agencies to qualify Budget, Authority, Need, and Timeline.",
  icon: "Award",
  trigger_type: "keyword",
  trigger_config: {
    keywords: ["qualify", "quote", "pricing", "assessment"],
    match_type: "contains",
  },
  entry_node_id: "start",
  nodes: [
    { node_key: "start", node_type: "start", config: { next_node_key: "welcome" } },
    {
      node_key: "welcome",
      node_type: "send_buttons",
      config: {
        text: "👋 *Welcome!* To help us provide an accurate quote and match you with the right specialist, please answer 4 quick questions.",
        buttons: [
          { reply_id: "start_quiz", title: "Start Qualification", next_node_key: "ask_need" },
          { reply_id: "speak_rep", title: "Speak to Agent", next_node_key: "lead_handoff" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "ask_need",
      node_type: "send_list",
      config: {
        text: "1️⃣ *What is your primary requirement?*",
        button_label: "Select Service",
        sections: [
          {
            title: "Service Requirements",
            rows: [
              { reply_id: "urgent_svc", title: "Urgent Case / Immediate", description: "Need urgent filing or defense", next_node_key: "ask_budget" },
              { reply_id: "planned_svc", title: "Standard Application", description: "Filing within regular timeframe", next_node_key: "ask_budget" },
              { reply_id: "exploring_svc", title: "General Information", description: "Comparing options and pricing", next_node_key: "ask_budget" },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    {
      node_key: "ask_budget",
      node_type: "send_buttons",
      config: {
        text: "2️⃣ *What is your approximate budget for professional services?*",
        buttons: [
          { reply_id: "b_premium", title: "Premium ($3,000+)", next_node_key: "ask_authority" },
          { reply_id: "b_standard", title: "Standard ($1.5k-$3k)", next_node_key: "ask_authority" },
          { reply_id: "b_basic", title: "Basic (Under $1,500)", next_node_key: "ask_authority" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "ask_authority",
      node_type: "send_buttons",
      config: {
        text: "3️⃣ *Are you the primary decision-maker for this application?*",
        buttons: [
          { reply_id: "auth_self", title: "Yes, for myself", next_node_key: "ask_timeline" },
          { reply_id: "auth_family", title: "For family member", next_node_key: "ask_timeline" },
          { reply_id: "auth_research", title: "For someone else", next_node_key: "ask_timeline" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "ask_timeline",
      node_type: "send_buttons",
      config: {
        text: "4️⃣ *How soon are you planning to begin?*",
        buttons: [
          { reply_id: "time_now", title: "Immediately", next_node_key: "lead_summary" },
          { reply_id: "time_month", title: "Within 30 Days", next_node_key: "lead_summary" },
          { reply_id: "time_future", title: "In 1–3 Months", next_node_key: "lead_summary" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "lead_summary",
      node_type: "send_message",
      config: {
        text: "✨ *Thank you for providing your details!*\n\nYour profile has been matched with our dedicated client onboarding team. An account executive will reach out to you within 15 minutes.",
        next_node_key: "lead_handoff",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "lead_handoff",
      node_type: "handoff",
      config: {
        note: "BANT Qualification completed — High intent lead ready for discovery call.",
      } as HandoffNodeConfig,
    },
    { node_key: "end", node_type: "end", config: {} },
  ],
};

// ============================================================
// Registry
// ============================================================

const TEMPLATES: Record<string, FlowTemplate> = {
  welcome_menu: WELCOME_MENU,
  faq_bot: FAQ_BOT,
  lead_capture: LEAD_CAPTURE,
  service_intake: SERVICE_INTAKE,
  appointment_booking: APPOINTMENT_BOOKING,
  document_collector: DOCUMENT_COLLECTOR,
  feedback_survey: FEEDBACK_SURVEY,
  product_recommender: PRODUCT_RECOMMENDER,
  onboarding_checklist: ONBOARDING_CHECKLIST,
  canada_crs_calculator: CANADA_CRS_CALCULATOR,
  australia_points_test: AUSTRALIA_POINTS_TEST,
  uk_visa_eligibility: UK_VISA_ELIGIBILITY,
  universal_lead_scoring: UNIVERSAL_LEAD_SCORING,
};

export function getFlowTemplate(slug: string): FlowTemplate | null {
  return TEMPLATES[slug] ?? null;
}

export function listFlowTemplates(): FlowTemplate[] {
  return Object.values(TEMPLATES);
}

