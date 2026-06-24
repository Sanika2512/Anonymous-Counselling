(function () {
    function injectRatingStyles() {
        if (document.getElementById("counselor-rating-modal-styles")) return;
        const style = document.createElement("style");
        style.id = "counselor-rating-modal-styles";
        style.textContent = `
            .counselor-rating-modal { position: fixed; inset: 0; z-index: 100000; display: grid; place-items: center; padding: 18px; opacity: 0; visibility: hidden; transition: opacity .28s ease, visibility .28s ease; }
            .counselor-rating-modal.show { opacity: 1; visibility: visible; }
            .counselor-rating-backdrop { position: absolute; inset: 0; background: rgba(15, 22, 40, .62); backdrop-filter: blur(12px); }
            .counselor-rating-card { position: relative; width: min(94vw, 470px); border-radius: 26px; padding: 34px; color: #172033; background: linear-gradient(145deg, rgba(255,255,255,.96), rgba(244,247,255,.9)); border: 1px solid rgba(255,255,255,.78); box-shadow: 0 32px 90px rgba(31,41,70,.34); transform: translateY(24px) scale(.94); transition: transform .34s cubic-bezier(.2,1.35,.32,1), opacity .28s ease; opacity: 0; overflow: hidden; }
            .counselor-rating-modal.show .counselor-rating-card { transform: translateY(0) scale(1); opacity: 1; }
            .counselor-rating-card:before { content: ""; position: absolute; inset: 0; background: linear-gradient(135deg, rgba(67,97,238,.11), rgba(123,47,247,.08) 42%, rgba(255,255,255,0)); pointer-events: none; }
            .rating-close-x { position: absolute; top: 16px; right: 16px; width: 36px; height: 36px; border: 0; border-radius: 50%; background: rgba(67,97,238,.1); color: #5a6482; display: grid; place-items: center; cursor: pointer; transition: all .2s ease; z-index: 1; }
            .rating-close-x:hover { background: rgba(67,97,238,.18); color: #172033; transform: translateY(-1px); }
            .rating-kicker { display: inline-flex; align-items: center; gap: 8px; padding: 7px 12px; border-radius: 999px; background: rgba(67,97,238,.1); color: #4361ee; font-size: .78rem; font-weight: 800; letter-spacing: .02em; margin-bottom: 16px; }
            .counselor-rating-card h2 { font-family: 'Sora', sans-serif; font-size: 1.52rem; margin: 0 0 10px; font-weight: 800; color: #101828; letter-spacing: 0; }
            .counselor-rating-card p { color: #5a6482; line-height: 1.55; margin: 0 0 18px; }
            .rating-stars { display: flex; justify-content: center; gap: 8px; margin: 22px 0 24px; }
            .rating-star { width: 46px; height: 46px; border: 0; border-radius: 14px; background: #eef2ff; color: #cbd5e1; cursor: pointer; transition: transform .18s ease, color .18s ease, background .18s ease, box-shadow .18s ease; }
            .rating-star.active, .rating-star:hover { color: #fbbf24; background: #fff7df; transform: translateY(-3px) scale(1.05); box-shadow: 0 10px 22px rgba(251,191,36,.22); }
            .rating-feedback-label { display: block; text-align: left; font-weight: 800; color: #26324c; font-size: .9rem; margin-bottom: 8px; }
            .rating-feedback { width: 100%; min-height: 112px; resize: vertical; border-radius: 18px; border: 1.5px solid #dfe6fb; padding: 14px 16px; outline: none; color: #172033; background: rgba(255,255,255,.8); transition: border-color .2s ease, box-shadow .2s ease; }
            .rating-feedback:focus { border-color: #4361ee; box-shadow: 0 0 0 4px rgba(67,97,238,.12); }
            .rating-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 20px; }
            .rating-actions button { min-height: 48px; border-radius: 999px; font-weight: 800; cursor: pointer; transition: transform .2s ease, box-shadow .2s ease, opacity .2s ease; }
            .rating-primary { border: 0; color: white; background: linear-gradient(135deg, #4361ee, #7b2ff7); box-shadow: 0 14px 28px rgba(67,97,238,.28); }
            .rating-secondary { border: 1.5px solid #dfe6fb; color: #5a6482; background: rgba(255,255,255,.8); }
            .rating-actions button:hover { transform: translateY(-2px); }
            .rating-actions button:disabled { cursor: not-allowed; opacity: .72; transform: none; }
            .rating-error { min-height: 20px; color: #dc2626; font-size: .86rem; margin-top: 10px; text-align: left; }
            .rating-success-state { display: none; text-align: center; padding: 10px 0 4px; }
            .rating-success-state.show { display: block; }
            .rating-success-icon { width: 72px; height: 72px; margin: 0 auto 18px; border-radius: 50%; display: grid; place-items: center; background: #dcfce7; color: #16a34a; font-size: 2.5rem; animation: ratingPop .45s cubic-bezier(.2,1.35,.32,1); }
            @keyframes ratingPop { from { transform: scale(.55); opacity: 0; } to { transform: scale(1); opacity: 1; } }
            @media (max-width: 560px) { .counselor-rating-card { padding: 28px 20px; border-radius: 22px; } .rating-actions { grid-template-columns: 1fr; } .rating-star { width: 42px; height: 42px; } }
        `;
        document.head.appendChild(style);
    }

    class RatingModal {
        constructor({ onSubmitted } = {}) {
            this.onSubmitted = onSubmitted;
            this.counselorId = null;
            this.rating = 0;
            injectRatingStyles();
            this.mount();
        }

        mount() {
            this.root = document.createElement("div");
            this.root.className = "counselor-rating-modal";
            this.root.setAttribute("role", "dialog");
            this.root.setAttribute("aria-modal", "true");
            this.root.setAttribute("aria-labelledby", "ratingModalTitle");
            this.root.innerHTML = `
                <div class="counselor-rating-backdrop" data-close="true"></div>
                <section class="counselor-rating-card">
                    <button type="button" class="rating-close-x" aria-label="Close rating modal"><i class="fas fa-times"></i></button>
                    <div class="rating-form-state">
                        <div class="rating-kicker"><i class="fas fa-heart"></i> We Value Your Feedback</div>
                        <h2 id="ratingModalTitle">How would you rate your experience?</h2>
                        <p>You have completed a counseling conversation with this counselor.</p>
                        <div class="rating-stars" role="radiogroup" aria-label="Interactive 5-star rating"></div>
                        <label class="rating-feedback-label" for="ratingFeedback">Optional Feedback:</label>
                        <textarea id="ratingFeedback" class="rating-feedback" maxlength="1000" placeholder="Tell us what was helpful about this counseling session..."></textarea>
                        <div class="rating-error" aria-live="polite"></div>
                        <div class="rating-actions">
                            <button type="button" class="rating-primary">Submit Rating</button>
                            <button type="button" class="rating-secondary">Maybe Later</button>
                        </div>
                    </div>
                    <div class="rating-success-state">
                        <div class="rating-success-icon"><i class="fas fa-check"></i></div>
                        <h2>Thank You!</h2>
                        <p>Your feedback helps improve our counseling community and supports quality guidance for students.</p>
                    </div>
                </section>
            `;
            document.body.appendChild(this.root);
            this.starRating = new window.StarRating(this.root.querySelector(".rating-stars"), (value) => {
                this.rating = value;
                this.setError("");
            });
            this.root.querySelector(".rating-close-x").addEventListener("click", () => this.close());
            this.root.querySelector(".rating-secondary").addEventListener("click", () => this.close());
            this.root.querySelector("[data-close]").addEventListener("click", () => this.close());
            this.root.querySelector(".rating-primary").addEventListener("click", () => this.submit());
            document.addEventListener("keydown", (event) => {
                if (event.key === "Escape" && this.root.classList.contains("show")) this.close();
            });
        }

        open({ counselorId, counselorName }) {
            this.counselorId = counselorId;
            this.rating = 0;
            this.starRating.setValue(0);
            this.root.querySelector(".rating-feedback").value = "";
            this.root.querySelector(".rating-form-state").style.display = "block";
            this.root.querySelector(".rating-success-state").classList.remove("show");
            this.root.querySelector("#ratingModalTitle").textContent = counselorName
                ? `How would you rate your experience with ${counselorName}?`
                : "How would you rate your experience?";
            this.setError("");
            this.root.classList.add("show");
            setTimeout(() => this.root.querySelector(".rating-star")?.focus(), 80);
        }

        close() {
            this.root.classList.remove("show");
        }

        setError(message) {
            this.root.querySelector(".rating-error").textContent = message;
        }

        async submit() {
            if (!this.rating) {
                this.setError("Please select a star rating before submitting.");
                return;
            }

            const button = this.root.querySelector(".rating-primary");
            button.disabled = true;
            button.textContent = "Submitting...";
            try {
                const data = await window.RatingService.submit({
                    counselorId: this.counselorId,
                    rating: this.rating,
                    feedback: this.root.querySelector(".rating-feedback").value
                });
                this.root.querySelector(".rating-form-state").style.display = "none";
                this.root.querySelector(".rating-success-state").classList.add("show");
                if (this.onSubmitted) this.onSubmitted(this.counselorId, data);
                setTimeout(() => this.close(), 2600);
            } catch (error) {
                this.setError(error.data?.hasRated ? "You have already rated this counselor." : (error.message || "Unable to submit rating."));
            } finally {
                button.disabled = false;
                button.textContent = "Submit Rating";
            }
        }
    }

    window.RatingModal = RatingModal;
})();
