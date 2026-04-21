(function () {
  const esc = (value) =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const track = (event, data = {}) => {
    if (window.dataLayer && typeof window.dataLayer.push === "function") {
      window.dataLayer.push({ event, ...data });
    }
  };

  const revealItems = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15 }
    );

    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  }

  const testimonialCarousel = document.querySelector("[data-testimonials-carousel]");
  if (testimonialCarousel) {
    const prevButton = document.querySelector("[data-carousel-prev]");
    const nextButton = document.querySelector("[data-carousel-next]");
    const testimonialCards = Array.from(testimonialCarousel.querySelectorAll(".testimonial"));
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const getStep = () => {
      if (testimonialCards.length > 1) {
        const firstCard = testimonialCards[0];
        const secondCard = testimonialCards[1];
        if (firstCard && secondCard) {
          return Math.max(1, secondCard.offsetLeft - firstCard.offsetLeft);
        }
        const cardWidth = firstCard?.getBoundingClientRect().width || testimonialCarousel.clientWidth;
        return cardWidth + 16;
      }

      return testimonialCarousel.clientWidth;
    };

    const updateButtons = () => {
      const maxScrollLeft = Math.max(0, testimonialCarousel.scrollWidth - testimonialCarousel.clientWidth - 1);
      if (prevButton) {
        prevButton.disabled = testimonialCarousel.scrollLeft <= 1;
      }
      if (nextButton) {
        nextButton.disabled = testimonialCarousel.scrollLeft >= maxScrollLeft;
      }
    };

    const scrollCarousel = (direction) => {
      testimonialCarousel.scrollBy({
        left: direction * getStep(),
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
    };

    prevButton?.addEventListener("click", () => scrollCarousel(-1));
    nextButton?.addEventListener("click", () => scrollCarousel(1));

    testimonialCarousel.addEventListener("scroll", updateButtons, { passive: true });
    testimonialCarousel.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        scrollCarousel(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        scrollCarousel(1);
      }
    });

    window.addEventListener("resize", updateButtons);
    updateButtons();
  }

  document.querySelectorAll("[data-track]").forEach((element) => {
    element.addEventListener("click", () => {
      track("cta_click", {
        label: element.textContent.trim(),
        href: element.getAttribute("href"),
      });
    });
  });

  document.querySelectorAll("[data-lead-form]").forEach((form) => {
    const status = form.querySelector("[data-form-status]");
    const submitButton = form.querySelector('button[type="submit"]');

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (form.dataset.submitting === "true") {
        return;
      }

      const formData = new FormData(form);
      formData.set("submittedAt", new Date().toISOString());
      const body = new URLSearchParams(formData).toString();

      form.dataset.submitting = "true";
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Sending...";
      }
      if (status) {
        status.textContent = "Submitting your request...";
      }

      try {
        const response = await fetch(form.action, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            Accept: "application/json",
          },
          body,
        });

        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          const message = payload.errors ? payload.errors.join(" ") : payload.error || "Unable to submit the form.";
          throw new Error(message);
        }

        track("lead_submit", {
          source: form.querySelector('input[name="source"]')?.value || "unknown",
        });

        const name = encodeURIComponent((formData.get("name") || "").toString());
        window.location.assign(`/thank-you${name ? `?name=${name}` : ""}`);
      } catch (error) {
        if (status) {
          status.textContent = error.message || "Something went wrong.";
        }
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = "Try Again";
        }
      } finally {
        form.dataset.submitting = "false";
      }
    });
  });

  document.querySelectorAll('a[href^="tel:"], a[href^="mailto:"]').forEach((link) => {
    link.addEventListener("click", () => {
      track("contact_click", { href: link.getAttribute("href") });
    });
  });

  const adminDashboard = document.querySelector("[data-admin-dashboard]");
  if (adminDashboard) {
    const endpoint = adminDashboard.getAttribute("data-admin-endpoint") || "/api/admin/leads";
    const tableBody = adminDashboard.querySelector("[data-admin-table-body]");
    const totalNodes = adminDashboard.querySelectorAll("[data-admin-total], [data-admin-total-count]");
    const recentNode = adminDashboard.querySelector("[data-admin-most-recent]");
    let refreshPromise = null;

    const renderRows = (leads) => {
      if (!leads.length) {
        return `<tr><td colspan="7" class="admin-empty">No leads have been submitted yet.</td></tr>`;
      }

      return leads
        .slice(0, 25)
        .map(
          (lead) => `
            <tr>
              <td>${esc(new Date(lead.submittedAt || lead.createdAt || Date.now()).toLocaleString())}</td>
              <td>${esc(lead.name || "")}</td>
              <td><a href="mailto:${esc(lead.email || "")}">${esc(lead.email || "")}</a></td>
              <td><a href="tel:${esc(lead.phone || "")}">${esc(lead.phone || "")}</a></td>
              <td>${esc(lead.address || "")}</td>
              <td>${esc(lead.serviceNeeded || "")}</td>
              <td class="admin-actions-cell">
                <button
                  type="button"
                  class="button button--danger button--tiny admin-delete-button"
                  data-delete-lead
                  data-lead-id="${esc(lead.id || "")}"
                  data-lead-name="${esc(lead.name || "this lead")}"
                  aria-label="Delete lead"
                >
                  <span class="admin-delete-mark" aria-hidden="true">X</span>
                  <span>Delete</span>
                </button>
              </td>
            </tr>
            <tr class="admin-message-row">
              <td colspan="7"><strong>Message:</strong> ${esc(lead.message || "")}</td>
            </tr>
          `
        )
        .join("");
    };

    const updateDashboard = async () => {
      if (refreshPromise) {
        return refreshPromise;
      }

      refreshPromise = (async () => {
      try {
        const response = await fetch(endpoint, {
          headers: { Accept: "application/json" },
          credentials: "same-origin",
        });

        if (!response.ok) {
          return;
        }

        const payload = await response.json();
        if (!payload.ok || !tableBody) {
          return;
        }

        if (payload.total != null) {
          totalNodes.forEach((node) => {
            node.textContent = String(payload.total);
          });
        }

        if (recentNode) {
          recentNode.textContent = payload.leads && payload.leads[0] ? payload.leads[0].name || "None" : "None";
        }

        tableBody.innerHTML = renderRows(payload.leads || []);
      } catch (error) {
        // Keep the existing dashboard if a refresh fails.
      } finally {
        refreshPromise = null;
      }
      })();

      return refreshPromise;
    };

    tableBody?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-delete-lead]");
      if (!button) {
        return;
      }

      const leadId = button.getAttribute("data-lead-id");
      const leadName = button.getAttribute("data-lead-name") || "this lead";
      if (!leadId) {
        return;
      }

      const confirmDelete = window.confirm(`Delete ${leadName}? This cannot be undone.`);
      if (!confirmDelete) {
        return;
      }

      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "Deleting...";

      try {
        const response = await fetch(`${endpoint}/${encodeURIComponent(leadId)}`, {
          method: "DELETE",
          headers: { Accept: "application/json" },
          credentials: "same-origin",
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "Unable to delete this lead.");
        }

        await updateDashboard();
      } catch (error) {
        window.alert(error.message || "Unable to delete this lead.");
      } finally {
        button.disabled = false;
        button.textContent = originalText || "Delete";
      }
    });

    updateDashboard();
    window.setInterval(updateDashboard, 5000);
  }

  const currentYearNode = document.querySelector("[data-current-year]");
  if (currentYearNode) {
    currentYearNode.textContent = String(new Date().getFullYear());
  }
})();
