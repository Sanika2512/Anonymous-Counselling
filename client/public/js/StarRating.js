(function () {
    class StarRating {
        constructor(root, onChange) {
            this.root = root;
            this.onChange = onChange;
            this.value = 0;
            this.render();
        }

        setValue(value) {
            this.value = Number(value) || 0;
            this.updateStars(this.value);
            if (this.onChange) this.onChange(this.value);
        }

        updateStars(value) {
            this.root.querySelectorAll("button").forEach((button) => {
                const starValue = Number(button.dataset.value);
                button.classList.toggle("active", starValue <= value);
                button.setAttribute("aria-checked", String(starValue === this.value));
            });
        }

        render() {
            this.root.innerHTML = [1, 2, 3, 4, 5].map((value) => `
                <button type="button" class="rating-star" data-value="${value}" role="radio" aria-label="${value} star" aria-checked="false">
                    <i class="fas fa-star" aria-hidden="true"></i>
                </button>
            `).join("");

            this.root.querySelectorAll("button").forEach((button) => {
                button.addEventListener("click", () => this.setValue(button.dataset.value));
                button.addEventListener("mouseenter", () => this.updateStars(Number(button.dataset.value)));
                button.addEventListener("mouseleave", () => this.updateStars(this.value));
                button.addEventListener("keydown", (event) => {
                    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
                        event.preventDefault();
                        this.setValue(Math.min(5, this.value + 1));
                    }
                    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
                        event.preventDefault();
                        this.setValue(Math.max(1, this.value - 1));
                    }
                });
            });
        }
    }

    window.StarRating = StarRating;
})();
