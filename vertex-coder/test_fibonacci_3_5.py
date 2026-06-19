from functools import lru_cache

@lru_cache(maxsize=None)
def fib(n: int) -> int:
    """
    Calculates the nth Fibonacci number using memoization.
    Time Complexity: O(n)
    Space Complexity: O(n)
    """
    if n < 0:
        raise ValueError("Fibonacci is not defined for negative integers.")
    if n == 0:
        return 0
    if n == 1:
        return 1
    return fib(n - 1) + fib(n - 2)

if __name__ == "__main__":
    print(fib(50))