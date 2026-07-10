# LeetSync Pro

LeetSync Pro is a powerful Chrome Extension that automatically captures your accepted LeetCode solutions and saves them to a GitHub repository organized by topic and pattern.

## 🚀 Key Features

- **Instant Modal Loading (0ms Delay)**: Displays the save dialog instantly using DOM fallback information, then loads full description and topic tags in the background.
- **Topic-wise Automatic Folders**: Categorizes your solutions into clean subdirectories based on their topic (e.g., `Arrays/`, `DP/`, `Graphs/`, `Trees/`).
- **Dynamic & Searchable Pattern Dropdowns**: Tailors recommended patterns based on the selected topic (e.g., Two Pointers, BFS, DFS, 0/1 Knapsack, etc.). Support for **22+ topics**! If you can't find a pattern, select **Other...** to write a custom pattern.
- **Time & Space Complexity Dropdowns**: Includes dropdowns for common time and space complexities:
  - **Time Complexities**: `O(1)`, `O(log n)`, `O(n)`, `O(n log n)`, `O(n^2)`, `O(n^3)`, `O(2^n)`, `O(n!)`
  - **Space Complexities**: `O(1)`, `O(log n)`, `O(n)`, `O(n log n)`, `O(n^2)`
  - Selecting **Other...** reveals a text field to input custom complexities (e.g., `O(n * log k)` or `O(k)`).
- **Comprehensive Solution Saving**:
  - Saves your code in a dedicated file with header comments detailing the Problem, URL, Approach, Topic, Pattern, Time Complexity, Space Complexity, and Notes.
  - Automatically generates/updates a `README.md` file in each problem folder with LeetCode info, description, and approach metrics (Time, Space, Runtime, Memory, Topic, and Pattern).
- **History Tab with Search & Filters**:
  - View all saved solutions directly in the extension popup.
  - Filter history by difficulty (Easy, Medium, Hard) or approach.
  - Live search through history items by problem title, topic, or pattern.
- **Excel / CSV Export**: Export your complete LeetCode sync history to a CSV file (including Topic, Pattern, Complexity, Notes, and GitHub URL) with a single click.
- **Keyboard Accessibility**: Submit options with `Enter` (when not focusing notes) and close the modal with `Esc` for a keyboard-first workflow.

---

## 📂 Folder Structure Style

When saved, solutions are organized on GitHub like this:

```text
leetcode-solutions/
  ├── Arrays/
  │    └── 1-Two-Sum/
  │         ├── two-sum-1-OA.java  (Optimal Approach)
  │         └── README.md          (Problem Info + Metric Table)
  └── Graphs/
       └── 200-Number-of-Islands/
            ├── number-of-islands-200-OA.py
            └── README.md
```

Code files include structured header comments:
```java
// Problem  : Two Sum
// URL      : https://leetcode.com/problems/two-sum/
// Approach : OA (Optimal Approach)
// Topic    : Array
// Pattern  : HashMap
// Time     : O(n)
// Space    : O(n)
//
// Notes:
//   Single-pass HashMap approach to find the complement.

... [Code] ...
```

---

## 🛠 Setup

1. Create a GitHub repository (e.g., `leetcode-solutions`).
2. Create a fine-grained GitHub personal access token with **Contents read/write** permission for that repository.
3. Open Chrome and navigate to `chrome://extensions`.
4. Enable **Developer mode** in the top right.
5. Click **Load unpacked** and select the `leetcode-sync-pro` folder.
6. Open any LeetCode problem, submit an accepted solution, and configure your GitHub settings in the extension popup.

---

## 📝 Usage

1. Open the popup to configure:
   - **GitHub Personal Access Token**
   - **Repository Owner** (username or organization)
   - **Repository Name**
   - **Branch** (e.g., `main` or `master`)
   - **Base Folder** (optional subdirectory inside your repository)
2. Submit an accepted solution on LeetCode.
3. The save modal will appear instantly:
   - Select the Approach (`Brute`, `Better`, `Optimal`, or `Custom`).
   - Select/change the **Topic folder**.
   - Choose the specific **Pattern** from the recommended dropdown list (or type custom using **Other...**).
   - Choose the **Time & Space complexities** from the common options (or choose **Other...** to write your custom complexities).
   - Enter optional notes.
4. Press `Enter` or click **Save to GitHub**.
5. Keep track of your progress and export logs using the **History** tab in the extension popup!
