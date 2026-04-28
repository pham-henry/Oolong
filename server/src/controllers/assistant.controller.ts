/**
 * Assistant controller — thin layer that:
 *   - validates input (Zod)
 *   - delegates to assistant.service (Ollama RAG flow)
 *   - records every request in the audit log (success or failure)
 *   - maps service errors to clean HTTP responses (no server crashes)
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { askAssistant, AssistantError } from '../services/assistant.service';
import { createAuditLog } from '../services/audit.service';

// Input contract: question must exist and be a non-empty string (max 1000 chars).
const questionSchema = z.object({
  question: z
    .string({ required_error: 'Question is required' })
    .trim()
    .min(1, 'Question is required')
    .max(1000, 'Question is too long (max 1000 characters)'),
});

export async function query(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // 1. Validate input up front so we never ship junk to the LLM.
  let question: string;
  try {
    question = questionSchema.parse(req.body).question;
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
    return;
  }

  // Trim the question used in the audit log so we never blow up the column.
  const auditQuestion =
    question.length > 200 ? `${question.slice(0, 200)}...` : question;

  // Tag queries that reference reorder recommendations so the audit trail
  // shows when the Owner is consulting the LLM about pending reorders.
  const referencesReorder = /reorder|recommend|pending|approve|low\s*stock|run\s*out|restock/i.test(
    question
  );
  const tagPrefix = referencesReorder ? '[reorder-context] ' : '';

  try {
    // 2. Run the RAG flow. The service catches Ollama failures internally
    //    and falls back to rule-based output, so a returned result is always
    //    a successful response from the user's perspective.
    const result = await askAssistant(question);

    // 3. Audit-log the question + outcome (ollama vs fallback). Tag queries
    //    that reference reorder recommendations so the audit trail can show
    //    when the Owner consulted the assistant about pending reorders.
    await createAuditLog(
      req.user!.userId,
      referencesReorder ? 'ASSISTANT_QUERY_REORDER' : 'ASSISTANT_QUERY',
      `${tagPrefix}[${result.source}] Question: ${auditQuestion}`
    );

    res.json({ answer: result.answer, source: result.source });
  } catch (err) {
    // 4. Best-effort failure audit. Don't let an audit hiccup mask the real error.
    try {
      await createAuditLog(
        req.user!.userId,
        'ASSISTANT_QUERY_FAILED',
        `Question: ${auditQuestion} | Error: ${
          err instanceof Error ? err.message.slice(0, 200) : 'unknown'
        }`
      );
    } catch {
      /* swallow audit failure */
    }

    // 5. Map known error types to clean HTTP responses.
    if (err instanceof AssistantError) {
      switch (err.code) {
        case 'INVALID_INPUT':
          res.status(400).json({ error: err.message });
          return;
        case 'OLLAMA_UNREACHABLE':
        case 'OLLAMA_TIMEOUT':
          res
            .status(503)
            .json({ error: 'Smart Assistant is temporarily unavailable.' });
          return;
        case 'OLLAMA_BAD_RESPONSE':
          res
            .status(502)
            .json({ error: 'Smart Assistant returned an invalid response.' });
          return;
      }
    }

    next(err);
  }
}
