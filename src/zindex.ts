const swap = <T>(elements: T[], indexA: number, indexB: number) => {
  const element = elements[indexA];
  elements[indexA] = elements[indexB];
  elements[indexB] = element;
};

export const moveOneLeft = <T>(elements: T[], indicesToMove: number[]) => {
  indicesToMove.sort((a: number, b: number) => a - b);
  let isSorted = true;
  // We go from left to right to avoid overriding the wrong elements
  indicesToMove.forEach((index, i) => {
    // We don't want to bubble the first elements that are sorted as they are
    // already in their correct position
    isSorted = isSorted && index === i;
    if (isSorted) {
      return;
    }
    swap(elements, index - 1, index);
  });

  return elements;
};

export const moveOneRight = <T>(elements: T[], indicesToMove: number[]) => {
  const reversedIndicesToMove = indicesToMove.sort(
    (a: number, b: number) => b - a,
  );
  let isSorted = true;

  // We go from right to left to avoid overriding the wrong elements
  reversedIndicesToMove.forEach((index, i) => {
    // We don't want to bubble the first elements that are sorted as they are
    // already in their correct position
    isSorted = isSorted && index === elements.length - i - 1;
    if (isSorted) {
      return;
    }
    swap(elements, index + 1, index);
  });
  return elements;
};

// Let's go through an example
//        |        |
// [a, b, c, d, e, f, g]
// -->
// [c, f, a, b, d, e, g]
//
// We are going to override all the elements we want to move, so we keep them in an array
// that we will restore at the end.
// [c, f]
//
// From now on, we'll never read those values from the array anymore
//        |1       |0
// [a, b, _, d, e, _, g]
//
// The idea is that we want to shift all the elements between the marker 0 and 1
// by one slot to the right.
//
//        |1       |0
// [a, b, _, d, e, _, g]
//          -> ->
//
// which gives us
//
//        |1       |0
// [a, b, _, _, d, e, g]
//
// Now, we need to move all the elements from marker 1 to the beginning by two (not one)
// slots to the right, which gives us
//
//        |1       |0
// [a, b, _, _, d, e, g]
//  ---|--^  ^
//     ------|
//
// which gives us
//
//        |1       |0
// [_, _, a, b, d, e, g]
//
// At this point, we can fill back the leftmost elements with the array we saved at
// the beginning
//
//        |1       |0
// [c, f, a, b, d, e, g]
//
// And we are done!
export const moveAllLeft = <T>(elements: T[], indicesToMove: number[]) => {
  indicesToMove.sort((a: number, b: number) => a - b);

  // Copy the elements to move
  const leftMostElements = indicesToMove.map((index) => elements[index]);

  const reversedIndicesToMove = indicesToMove
    // We go from right to left to avoid overriding elements.
    .reverse()
    // We add 0 for the final marker
    .concat([0]);

  reversedIndicesToMove.forEach((index, i) => {
    // We skip the first one as it is not paired with anything else
    if (i === 0) {
      return;
    }

    // We go from the next marker to the right (i - 1) to the current one (index)
    for (let pos = reversedIndicesToMove[i - 1] - 1; pos >= index; --pos) {
      // We move by 1 the first time, 2 the second... So we can use the index i in the array
      elements[pos + i] = elements[pos];
    }
  });

  // The final step
  leftMostElements.forEach((element, i) => {
    elements[i] = element;
  });

  return elements;
};

// Let's go through an example
//        |        |
// [a, b, c, d, e, f, g]
// -->
// [a, b, d, e, g, c, f]
//
// We are going to override all the elements we want to move, so we keep them in an array
// that we will restore at the end.
// [c, f]
//
// From now on, we'll never read those values from the array anymore
//        |0       |1
// [a, b, _, d, e, _, g]
//
// The idea is that we want to shift all the elements between the marker 0 and 1
// by one slot to the left.
//
//        |0       |1
// [a, b, _, d, e, _, g]
//          <- <-
//
// which gives us
//
//        |0       |1
// [a, b, d, e, _, _, g]
//
// Now, we need to move all the elements from marker 1 to the end by two (not one)
// slots to the left, which gives us
//
//        |0       |1
// [a, b, d, e, _, _, g]
//              ^------
//
// which gives us
//
//        |0       |1
// [a, b, d, e, g, _, _]
//
// At this point, we can fill back the rightmost elements with the array we saved at
// the beginning
//
//        |0       |1
// [a, b, d, e, g, c, f]
//
// And we are done!
export const moveAllRight = <T>(elements: T[], indicesToMove: number[]) => {
  const reversedIndicesToMove = indicesToMove.sort(
    (a: number, b: number) => b - a,
  );

  // Copy the elements to move
  const rightMostElements = reversedIndicesToMove.map(
    (index) => elements[index],
  );

  indicesToMove = reversedIndicesToMove
    // We go from left to right to avoid overriding elements.
    .reverse()
    // We last element index for the final marker
    .concat([elements.length]);

  indicesToMove.forEach((index, i) => {
    // We skip the first one as it is not paired with anything else
    if (i === 0) {
      return;
    }

    // We go from the next marker to the left (i - 1) to the current one (index)
    for (let pos = indicesToMove[i - 1] + 1; pos < index; ++pos) {
      // We move by 1 the first time, 2 the second... So we can use the index i in the array
      elements[pos - i] = elements[pos];
    }
  });

  // The final step
  rightMostElements.forEach((element, i) => {
    elements[elements.length - i - 1] = element;
  });

  return elements;
};
