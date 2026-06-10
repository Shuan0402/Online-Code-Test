import * as React from "react"
import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"

import {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from "./card"

describe("Card Components", () => {
  it("renders Card component with correct classes, children, and ref forwarding", () => {
    const ref = React.createRef()
    render(
      <Card ref={ref} className="custom-card-class">
        <span>Card Content Here</span>
      </Card>
    )

    const element = screen.getByText("Card Content Here").closest("div")
    expect(element).toBeInTheDocument()
    expect(element).toHaveClass("rounded-lg", "border", "bg-card", "custom-card-class")
    expect(ref.current).toBe(element)
  })

  it("renders CardHeader component with correct classes, children, and ref forwarding", () => {
    const ref = React.createRef()
    render(
      <CardHeader ref={ref} className="custom-header-class">
        <span>Header Info</span>
      </CardHeader>
    )

    const element = screen.getByText("Header Info").closest("div")
    expect(element).toBeInTheDocument()
    expect(element).toHaveClass("flex", "flex-col", "space-y-1.5", "p-6", "custom-header-class")
    expect(ref.current).toBe(element)
  })

  it("renders CardTitle component with correct classes, children, and ref forwarding", () => {
    const ref = React.createRef()
    render(
      <CardTitle ref={ref} className="custom-title-class">
        Title Text
      </CardTitle>
    )

    const element = screen.getByText("Title Text")
    expect(element).toBeInTheDocument()
    expect(element).toHaveClass("text-2xl", "font-semibold", "leading-none", "tracking-tight", "custom-title-class")
    expect(ref.current).toBe(element)
  })

  it("renders CardDescription component with correct classes, children, and ref forwarding", () => {
    const ref = React.createRef()
    render(
      <CardDescription ref={ref} className="custom-desc-class">
        Description Text
      </CardDescription>
    )

    const element = screen.getByText("Description Text")
    expect(element).toBeInTheDocument()
    expect(element).toHaveClass("text-sm", "text-muted-foreground", "custom-desc-class")
    expect(ref.current).toBe(element)
  })

  it("renders CardContent component with correct classes, children, and ref forwarding", () => {
    const ref = React.createRef()
    render(
      <CardContent ref={ref} className="custom-content-class">
        <span>Main Content</span>
      </CardContent>
    )

    const element = screen.getByText("Main Content").closest("div")
    expect(element).toBeInTheDocument()
    expect(element).toHaveClass("p-6", "pt-0", "custom-content-class")
    expect(ref.current).toBe(element)
  })

  it("renders CardFooter component with correct classes, children, and ref forwarding", () => {
    const ref = React.createRef()
    render(
      <CardFooter ref={ref} className="custom-footer-class">
        <span>Footer Info</span>
      </CardFooter>
    )

    const element = screen.getByText("Footer Info").closest("div")
    expect(element).toBeInTheDocument()
    expect(element).toHaveClass("flex", "items-center", "p-6", "pt-0", "custom-footer-class")
    expect(ref.current).toBe(element)
  })
})
