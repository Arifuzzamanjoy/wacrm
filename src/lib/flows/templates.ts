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
    | "ListTodo";
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
};

export function getFlowTemplate(slug: string): FlowTemplate | null {
  return TEMPLATES[slug] ?? null;
}

export function listFlowTemplates(): FlowTemplate[] {
  return Object.values(TEMPLATES);
}
