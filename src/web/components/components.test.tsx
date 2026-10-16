import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { json, stubFetch } from "../test/fetch";
import { ContextPicker } from "./ContextPicker";
import { ModelPicker } from "./ModelPicker";
import { SuggestionPanel } from "./SuggestionPanel";

afterEach(cleanup);

const target = { from: 0, to: 5, text: "Hello" };
const alternatives = ["Hi", "Hey", "Greetings"].map((text) => ({
  text,
  rationale: `${text} reason`,
}));

describe("SuggestionPanel", () => {
  test("applies the clicked alternative", () => {
    const onApply = mock();
    render(
      <SuggestionPanel
        state={{ status: "done", target, result: { alternatives, sources: ["notes/a.md"] } }}
        onApply={onApply}
        onRegenerate={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Hey"));
    expect(onApply).toHaveBeenCalledWith(alternatives[1]);
    expect(screen.getByText("notes/a.md")).toBeTruthy();
  });

  test("shows errors as alerts", () => {
    render(
      <SuggestionPanel
        state={{ status: "error", target, error: "boom" }}
        onApply={() => {}}
        onRegenerate={() => {}}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe("boom");
  });
});

describe("ContextPicker", () => {
  test("reports the indexed folder size", async () => {
    stubFetch(() => json({ root: "/n", files: 12, chunks: 40 }));
    render(<ContextPicker value="notes" onChange={() => {}} />);
    await waitFor(() => expect(screen.getByText("12 files · 40 sections")).toBeTruthy());
  });

  test("reports why a folder was rejected", async () => {
    stubFetch(() => json({ error: "/etc is outside the allowed context root" }, 400));
    render(<ContextPicker value="/etc" onChange={() => {}} />);
    await waitFor(() => expect(screen.getByText(/outside the allowed/)).toBeTruthy());
  });

  test("commits the typed path on Enter", () => {
    stubFetch(() => json({ root: "/n", files: 0, chunks: 0 }));
    const onChange = mock();
    render(<ContextPicker value="" onChange={onChange} />);
    const input = screen.getByLabelText("Context folder");
    fireEvent.change(input, { target: { value: "~/notes" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("~/notes");
  });
});

describe("ModelPicker", () => {
  test("discovers models with the entered key and selects the default", async () => {
    const requests = stubFetch(() => json({ defaultModel: "big", models: ["big", "small"] }));
    const onChange = mock();
    render(<ModelPicker apiKey="sk-1" value="" onChange={onChange} />);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("big"));
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer sk-1");
  });

  test("keeps the user's choice when it is still offered", async () => {
    stubFetch(() => json({ defaultModel: "big", models: ["big", "small"] }));
    const onChange = mock();
    render(<ModelPicker apiKey="sk-1" value="small" onChange={onChange} />);
    await waitFor(() => expect(screen.getByLabelText("Model").textContent).toContain("small"));
    expect(onChange).not.toHaveBeenCalled();
  });

  test("explains a rejected key", async () => {
    stubFetch(() => json({ error: "The model endpoint rejected the API key." }, 401));
    render(<ModelPicker apiKey="bad" value="" onChange={() => {}} />);
    await waitFor(() => expect(screen.getByText("Models unavailable")).toBeTruthy());
    expect(screen.getByTitle(/rejected the API key/)).toBeTruthy();
  });
});
