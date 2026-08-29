import { describe, it, expect } from "vitest";
import { listFlowTemplates, getFlowTemplate } from "./templates";
import { validateFlowForActivation } from "./validate";
import { INTERACTIVE_LIMITS } from "@/lib/whatsapp/meta-api";

describe("Flow Templates Registry", () => {
  const EXPECTED_SLUGS = [
    "welcome_menu",
    "faq_bot",
    "lead_capture",
    "service_intake",
    "appointment_booking",
    "document_collector",
    "feedback_survey",
    "product_recommender",
    "onboarding_checklist",
  ] as const;

  it("lists all 9 pre-built flow templates", () => {
    const templates = listFlowTemplates();
    expect(templates).toHaveLength(9);
    const slugs = templates.map((t) => t.slug);
    for (const slug of EXPECTED_SLUGS) {
      expect(slugs).toContain(slug);
    }
  });

  it("retrieves each template by slug via getFlowTemplate", () => {
    for (const slug of EXPECTED_SLUGS) {
      const tmpl = getFlowTemplate(slug);
      expect(tmpl).not.toBeNull();
      expect(tmpl?.slug).toBe(slug);
      expect(tmpl?.name.trim().length).toBeGreaterThan(0);
      expect(tmpl?.description.trim().length).toBeGreaterThan(0);
      expect(tmpl?.nodes.length).toBeGreaterThanOrEqual(4);
      expect(tmpl?.nodes.length).toBeLessThanOrEqual(12);
    }
  });

  it("returns null for non-existent slug", () => {
    expect(getFlowTemplate("non_existent_slug")).toBeNull();
  });

  describe.each(EXPECTED_SLUGS)("Template validation: %s", (slug) => {
    const template = getFlowTemplate(slug)!;

    it("passes validateFlowForActivation without any issues", () => {
      const issues = validateFlowForActivation(
        {
          name: template.name,
          trigger_type: template.trigger_type,
          trigger_config: template.trigger_config as Record<string, unknown>,
          entry_node_id: template.entry_node_id,
        },
        template.nodes as Array<{
          node_key: string;
          node_type: string;
          config: Record<string, unknown>;
        }>,
      );

      const errors = issues.filter((i) => i.severity === "error");
      expect(errors).toEqual([]);
    });

    it("contains at least one handoff node for human escalation", () => {
      const hasHandoff = template.nodes.some((n) => n.node_type === "handoff");
      expect(hasHandoff).toBe(true);
    });

    it("satisfies WhatsApp Cloud API limits across all interactive nodes", () => {
      for (const node of template.nodes) {
        if (node.node_type === "send_buttons") {
          const cfg = node.config as {
            buttons?: Array<{ title?: string; reply_id?: string }>;
          };
          const btns = cfg.buttons ?? [];
          expect(btns.length).toBeGreaterThanOrEqual(1);
          expect(btns.length).toBeLessThanOrEqual(INTERACTIVE_LIMITS.maxButtons);
          for (const btn of btns) {
            expect(btn.title?.length).toBeLessThanOrEqual(
              INTERACTIVE_LIMITS.buttonTitleMaxLength,
            );
          }
        }

        if (node.node_type === "send_list") {
          const cfg = node.config as {
            button_label?: string;
            sections?: Array<{
              rows?: Array<{ title?: string; description?: string }>;
            }>;
          };
          expect(cfg.button_label?.length).toBeLessThanOrEqual(
            INTERACTIVE_LIMITS.buttonTitleMaxLength,
          );
          const totalRows = (cfg.sections ?? []).reduce(
            (sum, s) => sum + (s.rows?.length ?? 0),
            0,
          );
          expect(totalRows).toBeGreaterThanOrEqual(1);
          expect(totalRows).toBeLessThanOrEqual(INTERACTIVE_LIMITS.maxListRowsTotal);
          for (const s of cfg.sections ?? []) {
            for (const r of s.rows ?? []) {
              if (r.title) {
                expect(r.title.length).toBeLessThanOrEqual(
                  INTERACTIVE_LIMITS.listRowTitleMaxLength,
                );
              }
              if (r.description) {
                expect(r.description.length).toBeLessThanOrEqual(
                  INTERACTIVE_LIMITS.listRowDescriptionMaxLength,
                );
              }
            }
          }
        }
      }
    });
  });
});
