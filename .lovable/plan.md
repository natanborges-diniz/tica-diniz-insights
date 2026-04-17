
User chose Option B: Edge Function enriches the response. No backend changes needed beyond what's already deployed. I'll update `os-status-public/index.ts` to:
1. TRIM all string fields (defensive — handles Firebird CHAR padding)
2. Add `etapaAmigavel` via dictionary lookup
3. Add `mensagem` ready-to-display for the chatbot

Keep it concise.
