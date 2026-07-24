import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import enAuth from "../../../messages/en/auth.json";
import { initiateMagicLink } from "@/lib/auth-client";

import { SignInForm } from "./sign-in-form";

// `vitest-axe`'s `matchers` subpath types this project's installed version
// ships as type-only, so `expect(...).toHaveNoViolations()` can't be wired
// up without fighting that mismatch. Asserting on `AxeResults.violations`
// directly is equivalent and avoids the broken subpath entirely.
async function expectNoAxeViolations(container: Element): Promise<void> {
  expect((await axe(container)).violations).toEqual([]);
}

vi.mock("@/lib/auth-client", () => ({
  initiateMagicLink: vi.fn(),
}));

const mockedInitiateMagicLink = vi.mocked(initiateMagicLink);

function renderSignInForm(initialReturnTo?: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={enAuth}>
      <SignInForm initialReturnTo={initialReturnTo} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SignInForm", () => {
  it("rejects an invalid email and never calls the auth client", async () => {
    const user = userEvent.setup();
    renderSignInForm();

    await user.type(
      screen.getByRole("textbox", { name: enAuth.Auth.signIn.emailLabel }),
      "not-an-email",
    );
    await user.click(
      screen.getByRole("button", { name: enAuth.Auth.signIn.submit }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      enAuth.Auth.signIn.emailInvalid,
    );
    expect(mockedInitiateMagicLink).not.toHaveBeenCalled();
  });

  it("submits the normalized email/locale and shows the generic check-your-email outcome", async () => {
    mockedInitiateMagicLink.mockResolvedValue({ status: "accepted" });
    const user = userEvent.setup();
    renderSignInForm();

    await user.type(
      screen.getByRole("textbox", { name: enAuth.Auth.signIn.emailLabel }),
      "  Person@Example.com  ",
    );
    await user.click(
      screen.getByRole("button", { name: enAuth.Auth.signIn.submit }),
    );

    await waitFor(() => {
      expect(mockedInitiateMagicLink).toHaveBeenCalledWith({
        email: "person@example.com",
        locale: "en",
        returnTo: "/en/account",
      });
    });

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(enAuth.Auth.signIn.sentTitle);
    expect(status).toHaveTextContent(enAuth.Auth.signIn.sentDescription);
    // No other UI branch (e.g. an "already have an account" or "no account
    // found" message) may exist alongside the generic outcome, regardless
    // of whether the address was new, existing, rate-limited, or
    // suppressed server-side — the API answer is identical either way.
    expect(
      screen.queryByRole("textbox", { name: enAuth.Auth.signIn.emailLabel }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: enAuth.Auth.signIn.submit }),
    ).not.toBeInTheDocument();
  });

  it("shows a generic failure state (not the success outcome) when the request itself fails", async () => {
    mockedInitiateMagicLink.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    renderSignInForm();

    await user.type(
      screen.getByRole("textbox", { name: enAuth.Auth.signIn.emailLabel }),
      "person@example.com",
    );
    await user.click(
      screen.getByRole("button", { name: enAuth.Auth.signIn.submit }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      enAuth.Auth.signIn.errorDescription,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it.each([
    { label: "an absolute URL", returnTo: "https://evil.example/phish" },
    { label: "a protocol-relative URL", returnTo: "//evil.example" },
    { label: "a foreign-locale route", returnTo: "/vi/account" },
  ])(
    "drops an unsafe returnTo ($label) and falls back to the default",
    async ({ returnTo }) => {
      mockedInitiateMagicLink.mockResolvedValue({ status: "accepted" });
      const user = userEvent.setup();
      renderSignInForm(returnTo);

      await user.type(
        screen.getByRole("textbox", { name: enAuth.Auth.signIn.emailLabel }),
        "person@example.com",
      );
      await user.click(
        screen.getByRole("button", { name: enAuth.Auth.signIn.submit }),
      );

      await waitFor(() => {
        expect(mockedInitiateMagicLink).toHaveBeenCalledWith(
          expect.objectContaining({ returnTo: "/en/account" }),
        );
      });
    },
  );

  it("forwards a safe, same-locale returnTo unchanged", async () => {
    mockedInitiateMagicLink.mockResolvedValue({ status: "accepted" });
    const user = userEvent.setup();
    renderSignInForm("/en/templates/lotus-commerce");

    await user.type(
      screen.getByRole("textbox", { name: enAuth.Auth.signIn.emailLabel }),
      "person@example.com",
    );
    await user.click(
      screen.getByRole("button", { name: enAuth.Auth.signIn.submit }),
    );

    await waitFor(() => {
      expect(mockedInitiateMagicLink).toHaveBeenCalledWith(
        expect.objectContaining({ returnTo: "/en/templates/lotus-commerce" }),
      );
    });
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderSignInForm();
    await expectNoAxeViolations(container);
  });
});
