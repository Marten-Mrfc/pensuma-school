/**
 * Friendly Dutch explanations of Python errors, for students aged 14–17.
 * Pure and isomorphic: used by PythonErrorCard and anywhere feedback is shown.
 */
import type { PythonError } from "@/lib/questions/schema";

export type ErrorExplanation = {
  /** Short title, e.g. "Onbekende naam". */
  title: string;
  /** What went wrong, in plain Dutch. */
  explanation: string;
  /** A concrete hint, when we can give one. */
  tip?: string;
  /** "timeout" | "stopped" | "error": lets the UI pick an icon/colour. */
  tone: "error" | "timeout" | "stopped" | "internal";
  /** True when `error.message` is already Dutch and needn't be shown separately. */
  messageIsDutch: boolean;
};

function quoted(message: string): string | null {
  const m = /'([^']+)'/.exec(message);
  return m ? m[1] : null;
}

function syntaxTip(message: string): string | undefined {
  const m = message.toLowerCase();
  if (m.includes("was never closed"))
    return "Je bent een haakje vergeten te sluiten. Tel je openings- en sluithaakjes.";
  if (
    m.includes("unmatched") ||
    m.includes("does not match opening parenthesis")
  )
    return "Er staat een haakje te veel, of de haakjes passen niet bij elkaar.";
  if (m.includes("expected ':'"))
    return "Na if, elif, else, for, while en def hoort een dubbele punt (:) aan het eind van de regel.";
  if (
    m.includes("unterminated string") ||
    m.includes("unterminated triple-quoted")
  )
    return "Je bent een aanhalingsteken vergeten aan het eind van een tekst.";
  if (m.includes("missing parentheses in call to 'print'"))
    return 'In Python 3 schrijf je print met haakjes: print("Hallo").';
  if (m.includes("maybe you meant '=='") || m.includes("cannot assign to"))
    return "Gebruik == om te vergelijken. Eén = gebruik je om een waarde op te slaan in een variabele.";
  if (m.includes("perhaps you forgot a comma"))
    return "Mis je misschien een komma tussen twee waarden?";
  if (m.includes("invalid character") || m.includes("invalid non-printable"))
    return "Je code bevat een vreemd teken, bijvoorbeeld een ‘slim’ aanhalingsteken uit Word of Google Docs. Typ de aanhalingstekens opnieuw in de editor.";
  if (m.includes("'return' outside function"))
    return "return mag alleen binnen een functie (def) staan.";
  if (
    m.includes("'break' outside loop") ||
    m.includes("'continue' not properly in loop")
  )
    return "break en continue mogen alleen binnen een for- of while-lus staan.";
  if (m.includes("invalid decimal literal"))
    return "Een naam mag niet met een cijfer beginnen, en een kommagetal schrijf je met een punt (3.5).";
  if (m.includes("expected 'else'"))
    return "Bij een korte if-expressie hoort ook een else.";
  if (m.includes("leading zeros"))
    return "Een getal mag niet met een 0 beginnen (schrijf 7 in plaats van 07).";
  return undefined;
}

function typeTip(message: string): string | undefined {
  if (/can only concatenate str \(not "(int|float)"\) to str/.test(message))
    return 'Je plakt tekst en een getal aan elkaar met +. Maak van het getal eerst tekst met str(...), of gebruik een komma in print: print("Leeftijd:", leeftijd).';
  if (
    /unsupported operand type\(s\) for .*'str'/.test(message) ||
    /'str' and '(int|float)'/.test(message)
  )
    return "Je rekent met tekst. input() geeft altijd tekst terug: maak er eerst een getal van met int(...) of float(...).";
  if (
    /not supported between instances of 'str' and '(int|float)'|'(int|float)' and 'str'/.test(
      message,
    )
  )
    return "Je vergelijkt tekst met een getal. Maak van de tekst eerst een getal met int(...) of float(...).";
  if (/takes \d+ positional arguments? but \d+ (were|was) given/.test(message))
    return "Je roept een functie aan met een ander aantal waarden dan de functie verwacht.";
  if (/missing \d+ required positional argument/.test(message))
    return "Je bent een waarde vergeten toen je de functie aanriep.";
  if (/object is not callable/.test(message))
    return "Je zet haakjes () achter iets dat geen functie is. Heb je misschien een variabele dezelfde naam gegeven als een functie?";
  if (/object is not subscriptable/.test(message))
    return "Je gebruikt [ ] achter iets dat geen lijst, tekst of dictionary is.";
  if (/object is not iterable/.test(message))
    return "Je probeert met for door iets te lopen dat geen lijst of tekst is. Bedoel je range(...)?";
  if (/'NoneType'/.test(message))
    return "Een van je waarden is None. Geeft een functie misschien niets terug (vergeten return)?";
  if (/indices must be integers/.test(message))
    return "Een positie in een lijst moet een heel getal zijn. Gebruik int(...) of // in plaats van /.";
  return undefined;
}

function valueTip(message: string): string | undefined {
  if (message.includes("invalid literal for int()"))
    return "int() kan deze tekst niet omzetten naar een heel getal. Is het een kommagetal? Gebruik dan float(). Let op: in Python schrijf je een kommagetal met een punt (3.5).";
  if (message.includes("could not convert string to float"))
    return "float() kan deze tekst niet omzetten naar een getal. Gebruik een punt in plaats van een komma (3.5, niet 3,5).";
  if (message.includes("math domain error"))
    return "Dit kan wiskundig niet, bijvoorbeeld de wortel uit een negatief getal.";
  if (
    message.includes("too many values to unpack") ||
    message.includes("not enough values to unpack")
  )
    return "Het aantal variabelen links van = past niet bij het aantal waarden rechts.";
  return undefined;
}

/** Explain a PythonError in friendly Dutch. */
export function explainError(error: PythonError): ErrorExplanation {
  const msg = error.message ?? "";
  const e = (
    title: string,
    explanation: string,
    tip?: string,
    tone: ErrorExplanation["tone"] = "error",
    messageIsDutch = false,
  ): ErrorExplanation => ({ title, explanation, tip, tone, messageIsDutch });

  switch (error.type) {
    case "SyntaxError":
      return e(
        "Syntaxfout",
        "Python begrijpt je code niet: er klopt iets niet aan hoe het geschreven is. Kijk goed naar de aangewezen regel (of de regel erboven).",
        syntaxTip(msg),
      );
    case "IndentationError":
      return e(
        "Inspringing klopt niet",
        "De spaties aan het begin van een regel (de inspringing) kloppen niet. In Python bepaalt de inspringing welke regels bij elkaar horen.",
        msg.includes("expected an indented block")
          ? "Na een regel die eindigt op een dubbele punt (:) moet de volgende regel inspringen, meestal 4 spaties."
          : msg.includes("unexpected indent")
            ? "Deze regel springt in terwijl dat hier niet hoort."
            : msg.includes("unindent does not match")
              ? "Deze regel springt niet even ver in als de regels erboven."
              : undefined,
      );
    case "TabError":
      return e(
        "Tabs en spaties door elkaar",
        "Je gebruikt tabs en spaties door elkaar om in te springen. Python raakt daarvan in de war.",
        "Gebruik overal 4 spaties om in te springen.",
      );
    case "NameError": {
      const name = quoted(msg);
      return e(
        "Onbekende naam",
        name
          ? `Python kent de naam \`${name}\` niet.`
          : "Je gebruikt een naam die Python niet kent.",
        name
          ? `Controleer de spelling (hoofdletters tellen mee) en of \`${name}\` al een waarde heeft gekregen vóór deze regel. Bedoelde je tekst? Zet er dan aanhalingstekens omheen: "${name}".`
          : "Controleer de spelling en of de variabele al een waarde heeft.",
      );
    }
    case "UnboundLocalError":
      return e(
        "Variabele nog niet gevuld",
        "Je gebruikt een variabele in een functie voordat je hem daar een waarde geeft.",
        "Geef de variabele eerst een waarde in de functie, of geef de waarde mee als parameter.",
      );
    case "TypeError":
      return e(
        "Verkeerd type",
        "Je gebruikt een waarde van het verkeerde soort (type), bijvoorbeeld tekst waar een getal nodig is.",
        typeTip(msg),
      );
    case "ValueError":
      return e(
        "Ongeldige waarde",
        "De waarde past niet bij wat je ermee probeert te doen.",
        valueTip(msg),
      );
    case "ZeroDivisionError":
      return e(
        "Delen door nul",
        "Je programma deelt door nul, en dat kan niet.",
        "Kan de deler 0 zijn? Bijvoorbeeld bij het gemiddelde van een lege lijst. Controleer dat eerst met een if.",
      );
    case "IndexError":
      return e(
        "Positie bestaat niet",
        "Je vraagt een plek in een lijst (of tekst) op die niet bestaat.",
        "Een lijst met 3 elementen heeft de posities 0, 1 en 2. Let op bij range(len(...)) en bij lijst[-1] van een lege lijst.",
      );
    case "KeyError":
      return e(
        "Sleutel bestaat niet",
        `De sleutel ${quoted(msg) ? `'${quoted(msg)}' ` : ""}staat niet in de dictionary.`,
        "Controleer de spelling van de sleutel, of gebruik dictionary.get(sleutel) of `if sleutel in dictionary:`.",
      );
    case "AttributeError":
      return e(
        "Onbekende eigenschap of methode",
        "Deze waarde heeft de eigenschap of methode niet die je gebruikt.",
        msg.includes("'NoneType'")
          ? "Je waarde is None. Geeft een functie misschien niets terug (vergeten return)?"
          : "Controleer de spelling en het type van de waarde. Een tekst (str) heeft bijvoorbeeld geen append; een lijst wel.",
      );
    case "EOFError":
      return e(
        "Te weinig invoer",
        msg ||
          "Je programma vraagt vaker om invoer (input) dan er invoer is gegeven.",
        "Tel hoe vaak je input() aanroept. Bij een test krijgt je programma precies de invoer uit die test, regel voor regel.",
        "error",
        true,
      );
    case "RecursionError":
      return e(
        "Te diepe recursie",
        "Je functie roept zichzelf te vaak aan (of twee functies roepen elkaar steeds aan).",
        "Zorg voor een stopvoorwaarde (base case) die zeker bereikt wordt.",
      );
    case "TimeoutError":
      return e(
        "Tijdslimiet bereikt",
        "Je programma duurde te lang – zit er misschien een oneindige lus in?",
        "Controleer of de voorwaarde van je while-lus ooit onwaar wordt, en of je de teller in de lus verandert.",
        "timeout",
        true,
      );
    case "MemoryError":
      return e(
        "Te veel geheugen",
        "Je programma gebruikt te veel geheugen.",
        "Maak je misschien een enorme lijst of tekst, bijvoorbeeld in een oneindige lus?",
        "error",
        msg === "" || /geheugen/.test(msg),
      );
    case "OutputLimitExceeded":
      return e(
        "Te veel uitvoer",
        msg || "Je programma printte te veel tekst.",
        "Staat er een print in een oneindige lus?",
        "error",
        true,
      );
    case "ModuleNotFoundError":
    case "ImportError":
      return e(
        "Module niet gevonden",
        "Deze module bestaat niet, of is hier niet beschikbaar.",
        "Controleer de spelling. Standaardmodules zoals math en random werken; extra pakketten zoals numpy niet.",
      );
    case "OverflowError":
      return e(
        "Getal te groot",
        "Een getal werd te groot om mee te rekenen.",
        undefined,
      );
    case "AssertionError":
      return e(
        "Controle mislukt",
        "Een assert-controle in je code klopte niet.",
        undefined,
      );
    case "KeyboardInterrupt":
    case "Stopped":
      return e(
        "Gestopt",
        "Je hebt het programma gestopt.",
        undefined,
        "stopped",
        true,
      );
    case "SystemExit":
      return e(
        "Programma afgesloten",
        msg || "Je programma riep exit() aan.",
        undefined,
        "error",
        true,
      );
    case "SandboxCrash":
    case "InternalError":
    case "InputTooLarge":
      return e(
        "Er ging iets mis",
        msg ||
          "Er ging iets mis bij het uitvoeren van je code. Dit ligt niet aan jou.",
        "Probeer het nog een keer. Blijft het gebeuren? Laat het je docent weten.",
        "internal",
        true,
      );
    default:
      return e(
        error.type || "Fout",
        "Er ging iets mis tijdens het uitvoeren van je programma.",
        undefined,
      );
  }
}
