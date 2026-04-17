
User is asking strategic question: should the Lens (this project) keep generating the user-facing `mensagem`, or should it return only structured/factual data and let the chatbot's AI (Connect & Flow project) compose the message?

User's reasoning is solid:
1. Operator needs to know the delay (internal context)
2. Customer should NOT see "6 days late" or "original forecast"
3. Customer doesn't contact the store — they go pick up
4. Different copy depending on stage (ready vs in production)
5. The Connect & Flow AI is better suited to contextualize

Recommendation: **Option B — Lens returns clean structured data, Connect & Flow AI composes the message.**

Why:
- Separation of concerns: Lens = source of truth / data; Connect & Flow = conversation / tone
- Easier to iterate copy without redeploying Lens edge function
- AI can adapt tone per channel (WhatsApp vs Web), per customer profile, per intent
- Internal fields (atrasoDias, dataPrevisao, statusAtraso) stay available for the AI's context but aren't forced into the customer message
- Avoids duplicate logic (today the message is hard-coded here; tomorrow CRM team wants to change wording → has to ask backend)

Plan is small: remove `mensagem` from response, keep everything else, add a clearer separation between "factual fields" and "operator context", and document the contract for the chatbot AI.

Will present concise plan with the contract change.
