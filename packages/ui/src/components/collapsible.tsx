"use client"

import * as React from "react"
import { ChevronsUpDown, Plus, X } from "lucide-react"

import { Button } from "./button"
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"

const Collapsible = CollapsiblePrimitive.Root
const CollapsibleTrigger = CollapsiblePrimitive.Trigger
const CollapsibleContent = CollapsiblePrimitive.Content

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
