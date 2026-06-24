(function () {
    class RatingService {
        static async check(counselorId) {
            const response = await fetch(`/api/ratings/check/${encodeURIComponent(counselorId)}`, {
                credentials: "same-origin"
            });
            return response.json();
        }

        static async submit({ counselorId, rating, feedback }) {
            const response = await fetch("/api/ratings/counselor", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ counselorId, rating, feedback })
            });
            const data = await response.json();
            if (!response.ok) {
                const error = new Error(data.message || "Unable to submit rating");
                error.data = data;
                throw error;
            }
            return data;
        }
    }

    window.RatingService = RatingService;
})();
