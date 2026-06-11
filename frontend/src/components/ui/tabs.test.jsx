import * as React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, beforeAll } from "vitest"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs"

describe("Tabs Components", () => {
  beforeAll(() => {
    if (typeof window.HTMLElement.prototype.hasPointerCapture !== "function") {
      window.HTMLElement.prototype.hasPointerCapture = () => false
    }
    if (typeof window.HTMLElement.prototype.releasePointerCapture !== "function") {
      window.HTMLElement.prototype.releasePointerCapture = () => {}
    }
  })
  it("renders Tabs system correctly with default active tab", () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList className="custom-list-class">
          <TabsTrigger value="tab1" className="custom-trigger1-class">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2" className="custom-trigger2-class">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1" className="custom-content1-class">Content 1</TabsContent>
        <TabsContent value="tab2" className="custom-content2-class">Content 2</TabsContent>
      </Tabs>
    )

    // Check Tab 1 content is visible
    expect(screen.getByText("Content 1")).toBeInTheDocument()
    
    // Radix UI default behaviour for hidden tab content: either not rendered or hidden (e.g. absent or has hidden attribute / style)
    // We check that Content 2 is not in the document or has hidden attribute.
    expect(screen.queryByText("Content 2")).not.toBeInTheDocument()
    
    // Check TabsList classes
    const tabsList = screen.getByRole("tablist")
    expect(tabsList).toBeInTheDocument()
    expect(tabsList).toHaveClass("inline-flex", "custom-list-class")

    // Check Triggers
    const trigger1 = screen.getByRole("tab", { name: "Tab 1" })
    const trigger2 = screen.getByRole("tab", { name: "Tab 2" })
    expect(trigger1).toBeInTheDocument()
    expect(trigger2).toBeInTheDocument()
    expect(trigger1).toHaveClass("inline-flex", "custom-trigger1-class")
    expect(trigger2).toHaveClass("inline-flex", "custom-trigger2-class")
  })

  it("switches tab content when trigger is clicked", () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>
    )

    expect(screen.getByText("Content 1")).toBeInTheDocument()
    expect(screen.queryByText("Content 2")).not.toBeInTheDocument()

    // Click Tab 2 trigger using events that Radix UI expects
    const trigger2 = screen.getByRole("tab", { name: "Tab 2" })
    fireEvent.pointerDown(trigger2, { button: 0 })
    fireEvent.pointerUp(trigger2, { button: 0 })
    fireEvent.click(trigger2)
    fireEvent.keyDown(trigger2, { key: " ", code: "Space", keyCode: 32, charCode: 32 })

    // Verify content switches
    expect(screen.getByText("Content 2")).toBeInTheDocument()
    expect(screen.queryByText("Content 1")).not.toBeInTheDocument()
  })

  it("forwards ref to TabsList, TabsTrigger, and TabsContent", () => {
    const listRef = React.createRef()
    const triggerRef = React.createRef()
    const contentRef = React.createRef()

    render(
      <Tabs defaultValue="tab1">
        <TabsList ref={listRef}>
          <TabsTrigger ref={triggerRef} value="tab1">Tab 1</TabsTrigger>
        </TabsList>
        <TabsContent ref={contentRef} value="tab1">Content 1</TabsContent>
      </Tabs>
    )

    expect(listRef.current).toBe(screen.getByRole("tablist"))
    expect(triggerRef.current).toBe(screen.getByRole("tab", { name: "Tab 1" }))
    expect(contentRef.current).toBe(screen.getByText("Content 1"))
  })
})
