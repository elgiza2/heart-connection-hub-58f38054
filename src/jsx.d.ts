import "react";

declare global {
  namespace JSX {
    type Element = import("react").JSX.Element;
    type ElementClass = import("react").JSX.ElementClass;
    type ElementAttributesProperty = import("react").JSX.ElementAttributesProperty;
    type ElementChildrenAttribute = import("react").JSX.ElementChildrenAttribute;
    type LibraryManagedAttributes<C, P> = import("react").JSX.LibraryManagedAttributes<C, P>;
    type IntrinsicAttributes = import("react").JSX.IntrinsicAttributes;
    type IntrinsicClassAttributes<T> = import("react").JSX.IntrinsicClassAttributes<T>;
    type IntrinsicElements = import("react").JSX.IntrinsicElements;
  }
}
